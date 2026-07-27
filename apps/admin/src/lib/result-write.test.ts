import { describe, it, expect, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";
import { upsertResult, ResultLockedError } from "./result-write";

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
    it("inserts the result", async () => {
      const stub = makeSupabaseStub(({ table }) =>
        table === "visit_tests"
          ? { data: { is_locked: false }, error: null }
          : { data: { id: "new-id" }, error: null },
      );

      const id = await upsertResult(stub.client as never, "staff-1", body);

      expect(id).toBe("new-id");
      expect(stub.calls.some((c) => c.table === "results" && c.method === "insert")).toBe(true);
    });

    it("treats a missing lock column as unlocked so an unmigrated cloud still works", async () => {
      const stub = makeSupabaseStub(({ table }) =>
        table === "visit_tests"
          ? { data: { is_locked: null }, error: null }
          : { data: { id: "new-id" }, error: null },
      );

      await expect(upsertResult(stub.client as never, "staff-1", body)).resolves.toBe("new-id");
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
