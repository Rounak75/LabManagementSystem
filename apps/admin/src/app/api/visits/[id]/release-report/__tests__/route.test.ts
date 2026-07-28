import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";

let sessionUser: { id: string; token: string; role: "Admin" | "Staff" } | null = {
  id: "admin-1",
  token: "tok",
  role: "Admin",
};
vi.mock("@/lib/auth-session", () => ({ getSessionUser: () => sessionUser }));
const stub = makeSupabaseStub({ data: null, error: null });
vi.mock("@/lib/supabase-client", () => ({ getServerSupabase: () => stub.client }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../route";

function req(body: unknown = {}): Request {
  return new Request("http://localhost/api/visits/v1/release-report", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "v1" }) };

beforeEach(() => {
  sessionUser = { id: "admin-1", token: "tok", role: "Admin" };
  stub.calls.length = 0;
  stub.client.from.mockClear();
});

describe("POST /api/visits/[id]/release-report", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    expect((await POST(req(), ctx)).status).toBe(401);
  });

  // Waiving a bill is the owner's call, not the front desk's.
  it("403 for Staff", async () => {
    sessionUser = { id: "staff-1", token: "tok", role: "Staff" };
    expect((await POST(req(), ctx)).status).toBe(403);
    expect(stub.calls.some((c) => c.method === "update")).toBe(false);
  });

  it("marks the visit released, recording who did it and why", async () => {
    const res = await POST(req({ reason: "regular customer" }), ctx);

    expect(res.status).toBe(200);
    const update = stub.calls.find((c) => c.table === "visits" && c.method === "update");
    const arg = update!.arg as Record<string, unknown>;
    expect(arg.report_release_override).toBe(true);
    expect(arg.report_release_override_by_user_id).toBe("admin-1");
    expect(arg.report_release_override_reason).toBe("regular customer");
    expect(arg.report_release_override_at).toBeTruthy();
    // Without this the update would rewrite every visit in the table.
    expect(
      stub.calls.some((c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "v1"),
    ).toBe(true);
  });

  it("clears the override, and the trail with it, when withholding again", async () => {
    const res = await POST(req({ release: false }), ctx);

    expect(res.status).toBe(200);
    const arg = stub.calls.find((c) => c.method === "update")!.arg as Record<string, unknown>;
    expect(arg.report_release_override).toBe(false);
    expect(arg.report_release_override_by_user_id).toBeNull();
    expect(arg.report_release_override_at).toBeNull();
  });

  it("audits the decision", async () => {
    await POST(req({ reason: "paid by cheque" }), ctx);
    const audit = stub.calls.find((c) => c.table === "audit_logs" && c.method === "insert");
    expect((audit!.arg as Record<string, unknown>).action).toBe("visit.report_release_override");
  });
});
