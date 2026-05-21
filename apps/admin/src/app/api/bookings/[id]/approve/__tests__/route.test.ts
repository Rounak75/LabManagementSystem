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
const ctx = { params: { id: "b1" } };
beforeEach(() => { sessionUser = { id: "admin-1", token: "tok" }; });

describe("POST /api/bookings/[id]/approve", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    stub = makeSupabaseStub({ data: null, error: null });
    expect((await POST(req(), ctx)).status).toBe(401);
  });

  it("approves: bumps version and records assignment", async () => {
    // version read returns 4 -> the update must write 5
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "bookings" && methods.includes("select")) return { data: { version: 4 }, error: null };
      return { data: null, error: null };
    });
    const res = await POST(req({ assigned_to_user_id: "u9" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const upd = stub.calls.find((c) => c.table === "bookings" && c.method === "update");
    expect(upd).toBeTruthy();
    expect((upd!.arg as any).status).toBe("Approved");
    expect((upd!.arg as any).approved_by_user_id).toBe("admin-1");
    expect((upd!.arg as any).assigned_to_user_id).toBe("u9");
    expect((upd!.arg as any).version).toBe(5);
    expect(stub.calls.some((c) => c.table === "bookings" && c.method === "eq" && c.arg === "id")).toBe(true);
  });

  it("defaults version to 1 and assignment to null when missing", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "bookings" && methods.includes("select")) return { data: null, error: null };
      return { data: null, error: null };
    });
    const res = await POST(req({}), ctx);
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
    const res = await POST(req({}), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("nope");
  });
});
