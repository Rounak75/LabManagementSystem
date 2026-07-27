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

/** Every write first reads the visit test's lock state. Answer that read with
 *  "unlocked" and delegate everything else to the test's own resolver. */
function unlocked(
  rest: Parameters<typeof makeSupabaseStub>[0] = { data: null, error: null },
): ReturnType<typeof makeSupabaseStub> {
  return makeSupabaseStub((ctx) =>
    ctx.table === "visit_tests"
      ? { data: { is_locked: false }, error: null }
      : typeof rest === "function"
        ? rest(ctx)
        : rest,
  );
}
beforeEach(() => { sessionUser = { id: "staff-1", token: "tok" }; });

describe("POST /api/results/upsert", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    stub = makeSupabaseStub({ data: null, error: null });
    expect((await POST(req(validBody))).status).toBe(401);
  });

  it("updates by id when body.id is present", async () => {
    stub = unlocked();
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

  it("on unique-violation (23505) reads existing row then updates it", async () => {
    // insert -> 23505; select(...).maybeSingle() -> existing row; update -> ok
    stub = unlocked(({ methods }) => {
      if (methods.includes("insert")) return { data: null, error: { code: "23505", message: "dup" } };
      if (methods.includes("maybeSingle")) return { data: { id: "found-id" }, error: null };
      return { data: null, error: null }; // the final update
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("found-id");
    // an insert was attempted first
    expect(stub.calls.some((c) => c.table === "results" && c.method === "insert")).toBe(true);
    // it then read keyed on visit_test_id + parameter_id
    expect(stub.calls.some((c) => c.method === "eq" && c.arg === "visit_test_id")).toBe(true);
    expect(stub.calls.some((c) => c.method === "eq" && c.arg === "parameter_id")).toBe(true);
    expect(stub.calls.some((c) => c.method === "maybeSingle")).toBe(true);
    // followed by a recovery update on results
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
