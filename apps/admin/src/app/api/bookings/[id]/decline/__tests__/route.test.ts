import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";

let sessionUser: { id: string; token: string } | null = { id: "admin-1", token: "tok" };
vi.mock("@/lib/auth-session", () => ({ getSessionUser: () => sessionUser }));

let stub = makeSupabaseStub({ data: null, error: null });
vi.mock("@/lib/supabase-client", () => ({ getServerSupabase: () => stub.client }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../route";

function req(body: unknown = {}): Request {
  return new Request("http://localhost/api/bookings/b1/decline", { method: "POST", body: JSON.stringify(body) });
}
const ctx = { params: Promise.resolve({ id: "b1" }) };
beforeEach(() => { sessionUser = { id: "admin-1", token: "tok" }; });

describe("POST /api/bookings/[id]/decline", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    stub = makeSupabaseStub({ data: null, error: null });
    expect((await POST(req(), ctx)).status).toBe(401);
  });

  it("declines: sets reason and bumps version", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "bookings" && methods.includes("select")) return { data: { version: 2 }, error: null };
      return { data: null, error: null };
    });
    const res = await POST(req({ reason: "duplicate" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const upd = stub.calls.find((c) => c.table === "bookings" && c.method === "update");
    expect(upd).toBeTruthy();
    expect((upd!.arg as any).status).toBe("Declined");
    expect((upd!.arg as any).decline_reason).toBe("duplicate");
    expect((upd!.arg as any).version).toBe(3);
    // Column alone would pass with an undefined value — which is what an
    // unawaited Next 15 `params` produces. The value is the real assertion.
    expect(
      stub.calls.some(
        (c) => c.table === "bookings" && c.method === "eq" && c.args[0] === "id" && c.args[1] === "b1",
      ),
    ).toBe(true);
  });

  it("defaults reason to null and version to 1 when missing", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "bookings" && methods.includes("select")) return { data: null, error: null };
      return { data: null, error: null };
    });
    const res = await POST(req({}), ctx);
    expect(res.status).toBe(200);
    const upd = stub.calls.find((c) => c.table === "bookings" && c.method === "update");
    expect((upd!.arg as any).decline_reason).toBe(null);
    expect((upd!.arg as any).version).toBe(1);
  });

  it("500 when the update errors", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "bookings" && methods.includes("update")) return { data: null, error: { message: "fail" } };
      return { data: null, error: null };
    });
    const res = await POST(req({}), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("fail");
  });
});
