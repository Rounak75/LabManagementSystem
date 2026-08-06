import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";

let sessionUser: { id: string; token: string } | null = { id: "admin-1", token: "tok" };
vi.mock("@/lib/auth-session", () => ({ getSessionUser: () => sessionUser }));

let stub = makeSupabaseStub({ data: null, error: null });
vi.mock("@/lib/supabase-client", () => ({ getServerSupabase: () => stub.client }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../route";

function req(body: unknown = {}): Request {
  return new Request("http://localhost/api/bookings/b1/approve", { method: "POST", body: JSON.stringify(body) });
}
const ctx = { params: Promise.resolve({ id: "b1" }) };
beforeEach(() => { sessionUser = { id: "admin-1", token: "tok" }; });

describe("POST /api/bookings/[id]/approve", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    stub = makeSupabaseStub({ data: null, error: null });
    expect((await POST(req(), ctx)).status).toBe(401);
  });

  /**
   * Approving writes the booking's phone onto a real Patient, where it becomes
   * that patient's portal login. The desktop refuses to approve without
   * recording what the confirmation call found (PHONE_CONFIRM_REQUIRED in
   * bookings.ipc) — but staff approve from their phones, here, and this route
   * asked nothing and stored null. The check existed only where it was not used.
   */
  describe("the confirmation call", () => {
    beforeEach(() => {
      stub = makeSupabaseStub(({ table, methods }) => {
        if (table === "bookings" && methods.includes("select")) return { data: { version: 4 }, error: null };
        return { data: null, error: null };
      });
    });

    it("refuses to approve when the call outcome is missing", async () => {
      const res = await POST(req({ assigned_to_user_id: "u9" }), ctx);
      expect(res.status).toBe(400);
      expect(stub.calls.some((c) => c.table === "bookings" && c.method === "update")).toBe(false);
    });

    it("refuses an outcome that is neither Reached nor NoAnswer", async () => {
      const res = await POST(req({ phone_confirm_outcome: "Maybe" }), ctx);
      expect(res.status).toBe(400);
    });

    it("records who confirmed the number and when", async () => {
      const res = await POST(req({ phone_confirm_outcome: "Reached" }), ctx);
      expect(res.status).toBe(200);

      const upd = stub.calls.find((c) => c.table === "bookings" && c.method === "update");
      expect((upd!.arg as any).phone_confirm_outcome).toBe("Reached");
      expect((upd!.arg as any).phone_confirmed_by_id).toBe("admin-1");
      expect(typeof (upd!.arg as any).phone_confirmed_at).toBe("string");
    });

    // "Nobody answered" is a decision staff are allowed to make. It has to stay
    // distinguishable from "nobody asked", which is what null means.
    it("allows approving after an unanswered call", async () => {
      const res = await POST(req({ phone_confirm_outcome: "NoAnswer" }), ctx);
      expect(res.status).toBe(200);
      const upd = stub.calls.find((c) => c.table === "bookings" && c.method === "update");
      expect((upd!.arg as any).phone_confirm_outcome).toBe("NoAnswer");
    });
  });

  it("approves: bumps version and records assignment", async () => {
    // version read returns 4 -> the update must write 5
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "bookings" && methods.includes("select")) return { data: { version: 4 }, error: null };
      return { data: null, error: null };
    });
    const res = await POST(req({ assigned_to_user_id: "u9", phone_confirm_outcome: "Reached" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const upd = stub.calls.find((c) => c.table === "bookings" && c.method === "update");
    expect(upd).toBeTruthy();
    expect((upd!.arg as any).status).toBe("Approved");
    expect((upd!.arg as any).approved_by_user_id).toBe("admin-1");
    expect((upd!.arg as any).assigned_to_user_id).toBe("u9");

    // The booking id has to reach the filter. An unawaited Next 15 `params`
    // leaves it undefined, which every other assertion here tolerates.
    expect(
      stub.calls.some(
        (c) => c.table === "bookings" && c.method === "eq" && c.args[0] === "id" && c.args[1] === "b1",
      ),
    ).toBe(true);
    expect((upd!.arg as any).version).toBe(5);
    expect(stub.calls.some((c) => c.table === "bookings" && c.method === "eq" && c.arg === "id")).toBe(true);
  });

  it("defaults version to 1 and assignment to null when missing", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "bookings" && methods.includes("select")) return { data: null, error: null };
      return { data: null, error: null };
    });
    const res = await POST(req({ phone_confirm_outcome: "Reached" }), ctx);
    expect(res.status).toBe(200);
    const upd = stub.calls.find((c) => c.table === "bookings" && c.method === "update");
    expect((upd!.arg as any).version).toBe(1);
    expect((upd!.arg as any).assigned_to_user_id).toBe(null);
  });

  it("500 when the update errors", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "bookings" && methods.includes("update")) return { data: null, error: { message: "nope" } };
      return { data: null, error: null };
    });
    const res = await POST(req({ phone_confirm_outcome: "Reached" }), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("nope");
  });
});
