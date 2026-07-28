import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";

type User = { id: string; token: string; role: string };
let sessionUser: User | null = { id: "admin-1", token: "tok", role: "Admin" };
vi.mock("@/lib/auth-session", () => ({ getSessionUser: () => sessionUser }));

let stub = makeSupabaseStub({ data: null, error: null });
vi.mock("@/lib/supabase-client", () => ({ getServerSupabase: () => stub.client }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../route";

function req(): Request {
  return new Request("http://localhost/api/visits/visit-1/verify", { method: "POST" });
}
const ctx = { params: Promise.resolve({ id: "visit-1" }) };
beforeEach(() => {
  sessionUser = { id: "admin-1", token: "tok", role: "Admin" };
  stub = makeSupabaseStub({ data: null, error: null });
});

describe("POST /api/visits/[id]/verify", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    expect((await POST(req(), ctx)).status).toBe(401);
  });

  it("403 when authenticated but not Admin", async () => {
    sessionUser = { id: "staff-1", token: "tok", role: "Staff" };
    expect((await POST(req(), ctx)).status).toBe(403);
    expect(stub.rpcCalls).toHaveLength(0);
  });

  // Verifying used to set visits.status and results.verified_at and stop there.
  // visit_tests.is_locked — the column the patient portal's report gate reads and
  // the locked-result trigger keys off — was never set, so a verified visit went
  // on telling the patient their report was being checked and its signed-off
  // results stayed editable. Locking has to happen for the workflow to finish, so
  // it belongs in the same call rather than as a follow-up write that can fail on
  // its own.
  it("verifies the visit in one atomic call", async () => {
    const res = await POST(req(), ctx);

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const call = stub.rpcCalls.find((c) => c.name === "verify_visits");
    expect(call).toBeTruthy();
    const args = call!.args as Record<string, unknown>;
    // Passing the column without the value would pass even when an unawaited
    // Next 15 `params` makes it undefined — the value is what says the right
    // visit was verified.
    expect(args.p_visit_ids).toEqual(["visit-1"]);
    expect(args.p_user_id).toBe("admin-1");
  });

  it("audits the verification", async () => {
    await POST(req(), ctx);
    const audit = stub.calls.find((c) => c.table === "audit_logs" && c.method === "insert");
    expect((audit!.arg as Record<string, unknown>).action).toBe("visit.verify");
    expect((audit!.arg as Record<string, unknown>).target_id).toBe("visit-1");
  });

  it("500 when the verification fails", async () => {
    stub = makeSupabaseStub({ data: null, error: { message: "boom" } });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });

  // The database refuses the sign-off for a non-Admin too, so a token that
  // slipped past the route check still cannot verify.
  it("403 when the database rejects the caller's role", async () => {
    stub = makeSupabaseStub({ data: null, error: { code: "42501", message: "not authorised" } });
    expect((await POST(req(), ctx)).status).toBe(403);
  });
});
