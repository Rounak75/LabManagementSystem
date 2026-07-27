import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";

let sessionUser: { id: string; token: string } | null = { id: "staff-1", token: "tok" };
vi.mock("@/lib/auth-session", () => ({ getSessionUser: () => sessionUser }));

// The stub is swapped per-test so each can use its own resolver.
let stub = makeSupabaseStub({ data: null, error: null });
vi.mock("@/lib/supabase-client", () => ({ getServerSupabase: () => stub.client }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/results/upsert", { method: "POST", body: JSON.stringify(body) });
}
const validBody = {
  visit_test_id: "vt1",
  parameter_id: "param1",
  value: "5.2",
  is_abnormal: false,
  version: 1,
};

/** Every write reads the visit test's lock state, then the current result row to
 *  assign the next version. Answer the first with "unlocked" and the second with
 *  `current`, delegating everything else to the test's own resolver. */
function unlocked(
  rest: Parameters<typeof makeSupabaseStub>[0] = { data: null, error: null },
  current: { id: string; version: number } | null = null,
): ReturnType<typeof makeSupabaseStub> {
  return makeSupabaseStub((ctx) => {
    if (ctx.table === "visit_tests") return { data: { is_locked: false }, error: null };
    // The version read; the insert chain also selects, so exclude it.
    if (ctx.table === "results" && ctx.methods.includes("select") && !ctx.methods.includes("insert")) {
      return { data: current, error: null };
    }
    return typeof rest === "function" ? rest(ctx) : rest;
  });
}
beforeEach(() => { sessionUser = { id: "staff-1", token: "tok" }; });

describe("POST /api/results/upsert", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    stub = makeSupabaseStub({ data: null, error: null });
    expect((await POST(req(validBody))).status).toBe(401);
  });

  it("updates by id when body.id is present", async () => {
    stub = unlocked({ data: null, error: null }, { id: "existing-id", version: 0 });
    const res = await POST(req({ ...validBody, id: "existing-id" }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("existing-id");
    const upd = stub.calls.find((c) => c.table === "results" && c.method === "update");
    expect(upd).toBeTruthy();
    expect((upd!.arg as any).value).toBe("5.2");
    expect((upd!.arg as any).entered_by_user_id).toBe("staff-1");
    // keyed by id, not by visit_test/parameter
    expect(stub.calls.some((c) => c.method === "eq" && c.arg === "id")).toBe(true);
    expect(stub.calls.some((c) => c.method === "eq" && c.arg === "visit_test_id")).toBe(false);
    // no insert happened on the id path
    expect(stub.calls.some((c) => c.table === "results" && c.method === "insert")).toBe(false);
  });

  it("inserts a new row when no id (returns generated id)", async () => {
    stub = unlocked({ data: { id: "new-row-id" }, error: null });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("new-row-id");
    const ins = stub.calls.find((c) => c.table === "results" && c.method === "insert");
    expect(ins).toBeTruthy();
    expect((ins!.arg as any).visit_test_id).toBe("vt1");
    expect((ins!.arg as any).parameter_id).toBe("param1");
    expect(stub.calls.some((c) => c.method === "single")).toBe(true);
  });

  it("on unique-violation (23505) reads the raced row then updates it", async () => {
    // Models a real race: the first version read finds nothing, so we insert;
    // a concurrent debounced save has created the row meanwhile, so the insert
    // hits 23505 and the re-read now finds it.
    let resultReads = 0;
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "visit_tests") return { data: { is_locked: false }, error: null };
      if (methods.includes("insert")) return { data: null, error: { code: "23505", message: "dup" } };
      if (table === "results" && methods.includes("select")) {
        resultReads += 1;
        return resultReads === 1
          ? { data: null, error: null }
          : { data: { id: "found-id", version: 4 }, error: null };
      }
      return { data: null, error: null }; // the recovery update
    });

    const res = await POST(req(validBody));

    expect(res.status).toBe(200);
    const bodyJson = await res.json();
    expect(bodyJson.id).toBe("found-id");
    // The raced row was at 4, so this write lands on 5 — not the client's number.
    expect(bodyJson.version).toBe(5);
    expect(stub.calls.some((c) => c.table === "results" && c.method === "insert")).toBe(true);
    expect(stub.calls.some((c) => c.method === "eq" && c.arg === "visit_test_id")).toBe(true);
    expect(stub.calls.some((c) => c.method === "eq" && c.arg === "parameter_id")).toBe(true);
    expect(stub.calls.filter((c) => c.table === "results" && c.method === "update").length).toBe(1);
  });

  it("409 result_locked when the visit test is verified and locked", async () => {
    // Distinct from 500 so the UI can say "ask an Admin to unlock" rather than
    // showing a generic failure the user cannot act on.
    stub = makeSupabaseStub(({ table }) =>
      table === "visit_tests"
        ? { data: { is_locked: true }, error: null }
        : { data: null, error: null },
    );

    const res = await POST(req({ ...validBody, id: "existing-id" }));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("result_locked");
    expect(stub.calls.some((c) => c.table === "results")).toBe(false);
  });

  it("500 when the insert errors with a non-unique-violation", async () => {
    stub = unlocked(({ methods }) => {
      if (methods.includes("insert")) return { data: null, error: { code: "42501", message: "denied" } };
      return { data: null, error: null };
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("denied");
  });
});
