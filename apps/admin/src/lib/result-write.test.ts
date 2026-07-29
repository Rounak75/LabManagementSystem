import { describe, it, expect, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";
import { upsertResult, ResultLockedError, VersionConflictError } from "./result-write";

const body = {
  visit_test_id: "vt1",
  parameter_id: "param1",
  value: "5.2",
  is_abnormal: false,
  version: 1,
};

describe("upsertResult", () => {
  describe("when the visit test is locked", () => {
    // A locked visit test has been verified and signed off by an Admin, and its
    // report may already be printed. The desktop refuses this write
    // (results.ipc: `if (vt.isLocked) throw FORBIDDEN`); the portal must too,
    // otherwise any Staff account can rewrite a signed-off result and sync
    // carries it to the master copy on the lab PC.
    let stub: ReturnType<typeof makeSupabaseStub>;

    beforeEach(() => {
      stub = makeSupabaseStub(({ table }) =>
        table === "visit_tests"
          ? { data: { is_locked: true }, error: null }
          : { data: null, error: null },
      );
    });

    it("rejects the write with ResultLockedError", async () => {
      await expect(upsertResult(stub.client as never, "staff-1", body)).rejects.toBeInstanceOf(
        ResultLockedError,
      );
    });

    it("writes nothing to the results table", async () => {
      await upsertResult(stub.client as never, "staff-1", body).catch(() => {});

      expect(stub.calls.some((c) => c.table === "results" && c.method === "insert")).toBe(false);
      expect(stub.calls.some((c) => c.table === "results" && c.method === "update")).toBe(false);
    });

    it("checks the lock even when updating an existing row by id", async () => {
      await expect(
        upsertResult(stub.client as never, "staff-1", { ...body, id: "existing" }),
      ).rejects.toBeInstanceOf(ResultLockedError);

      expect(stub.calls.some((c) => c.table === "results" && c.method === "update")).toBe(false);
    });
  });

  describe("when the visit test is unlocked", () => {
    /** No existing result → the version read must answer null, not a row. */
    function freshInsert(lockFlag: boolean | null) {
      return makeSupabaseStub(({ table, methods }) => {
        if (table === "visit_tests") return { data: { is_locked: lockFlag }, error: null };
        if (table === "results" && methods.includes("select") && !methods.includes("insert")) {
          return { data: null, error: null };
        }
        return { data: { id: "new-id" }, error: null };
      });
    }

    // The owner's dashboard counts its "tests entered but not locked" backlog
    // from result_entered_at. The desktop's own entry path sets it; the portal
    // never did, so results typed on a phone left that count reading zero
    // however much work was waiting to be verified.
    it("marks the test as having a result on it", async () => {
      const stub = freshInsert(false);

      await upsertResult(stub.client as never, "staff-1", body);

      const upd = stub.calls.find((c) => c.table === "visit_tests" && c.method === "update");
      expect(upd).toBeTruthy();
      const arg = upd!.arg as Record<string, unknown>;
      expect(arg.status).toBe("ResultEntered");
      expect(arg.result_entered_at).toBeTruthy();
      expect(
        stub.calls.some(
          (c) => c.table === "visit_tests" && c.method === "eq" && c.args[1] === "vt1",
        ),
      ).toBe(true);
    });

    it("inserts the result", async () => {
      const stub = freshInsert(false);

      const written = await upsertResult(stub.client as never, "staff-1", body);

      expect(written).toEqual({ id: "new-id", version: 1 });
      expect(stub.calls.some((c) => c.table === "results" && c.method === "insert")).toBe(true);
    });

    it("treats a missing lock column as unlocked so an unmigrated cloud still works", async () => {
      const stub = freshInsert(null);

      await expect(upsertResult(stub.client as never, "staff-1", body)).resolves.toEqual({
        id: "new-id",
        version: 1,
      });
    });
  });

  // The stored version decides who wins a desktop-vs-cloud conflict in
  // pull-results (`existing.version > r.version`). It must therefore be assigned
  // by the server: a client that sends its own number can inflate it and win
  // every future conflict against the master copy, and two clients that both
  // send `read + 1` silently overwrite one another.
  describe("version handling", () => {
    /** visit_tests → unlocked; results read → `current`; writes → ok. */
    function withCurrentVersion(current: number | null, over: Record<string, unknown> = {}) {
      return makeSupabaseStub(({ table, methods }) => {
        if (table === "visit_tests") return { data: { is_locked: false }, error: null };
        // The insert chain also calls .select("id"), so exclude it here —
        // otherwise the insert is answered by the read branch.
        if (table === "results" && methods.includes("select") && !methods.includes("insert")) {
          return { data: current === null ? null : { id: "r1", version: current }, error: null };
        }
        return { data: { id: "r1" }, error: null, ...over };
      });
    }

    it("ignores a client-supplied version and stores current + 1", async () => {
      const stub = withCurrentVersion(3);

      await upsertResult(stub.client as never, "staff-1", {
        ...body,
        id: "r1",
        version: 9999, // client claims a huge version to win all future conflicts
      });

      const upd = stub.calls.find((c) => c.table === "results" && c.method === "update");
      expect((upd!.arg as { version: number }).version).toBe(4);
    });

    it("starts a brand-new result at version 1", async () => {
      const stub = withCurrentVersion(null);

      await upsertResult(stub.client as never, "staff-1", { ...body, version: 500 });

      const ins = stub.calls.find((c) => c.table === "results" && c.method === "insert");
      expect((ins!.arg as { version: number }).version).toBe(1);
    });

    it("rejects the write when the client edited a stale version", async () => {
      const stub = withCurrentVersion(5);

      await expect(
        upsertResult(stub.client as never, "staff-1", { ...body, id: "r1", base_version: 3 }),
      ).rejects.toBeInstanceOf(VersionConflictError);
    });

    it("writes nothing when the version conflicts", async () => {
      const stub = withCurrentVersion(5);

      await upsertResult(stub.client as never, "staff-1", {
        ...body,
        id: "r1",
        base_version: 3,
      }).catch(() => {});

      expect(stub.calls.some((c) => c.table === "results" && c.method === "update")).toBe(false);
    });

    it("accepts the write when the client edited the current version", async () => {
      const stub = withCurrentVersion(5);

      await upsertResult(stub.client as never, "staff-1", {
        ...body,
        id: "r1",
        base_version: 5,
      });

      const upd = stub.calls.find((c) => c.table === "results" && c.method === "update");
      expect((upd!.arg as { version: number }).version).toBe(6);
    });

    // Requests queued offline by an older client carry no base_version. They must
    // still apply, but the server still assigns the version rather than trusting
    // whatever number the old client put in the payload.
    it("applies a legacy payload with no base_version, server-assigning the version", async () => {
      const stub = withCurrentVersion(7);

      await upsertResult(stub.client as never, "staff-1", { ...body, id: "r1", version: 2 });

      const upd = stub.calls.find((c) => c.table === "results" && c.method === "update");
      expect((upd!.arg as { version: number }).version).toBe(8);
    });
  });

  it("refuses the write when the visit test does not exist", async () => {
    const stub = makeSupabaseStub(({ table }) =>
      table === "visit_tests"
        ? { data: null, error: null }
        : { data: { id: "new-id" }, error: null },
    );

    await expect(upsertResult(stub.client as never, "staff-1", body)).rejects.toThrow(
      /visit test not found/i,
    );
    expect(stub.calls.some((c) => c.table === "results" && c.method === "insert")).toBe(false);
  });
});
