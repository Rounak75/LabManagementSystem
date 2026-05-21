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
const ctx = { params: { id: "visit-1" } };
beforeEach(() => { sessionUser = { id: "admin-1", token: "tok", role: "Admin" }; });

describe("POST /api/visits/[id]/verify", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    stub = makeSupabaseStub({ data: null, error: null });
    expect((await POST(req(), ctx)).status).toBe(401);
  });

  it("403 when authenticated but not Admin", async () => {
    sessionUser = { id: "staff-1", token: "tok", role: "Staff" };
    stub = makeSupabaseStub({ data: null, error: null });
    expect((await POST(req(), ctx)).status).toBe(403);
  });

  it("marks the visit Verified and locks its results", async () => {
    // visit update -> ok; visit_tests select -> two rows; results update -> ok
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "visit_tests" && methods.includes("select")) {
        return { data: [{ id: "vt1" }, { id: "vt2" }], error: null };
      }
      return { data: null, error: null };
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const vUpd = stub.calls.find((c) => c.table === "visits" && c.method === "update");
    expect(vUpd).toBeTruthy();
    expect((vUpd!.arg as any).status).toBe("Verified");
    expect((vUpd!.arg as any).verified_by_user_id).toBe("admin-1");
    expect(stub.calls.some((c) => c.table === "visits" && c.method === "eq" && c.arg === "id")).toBe(true);

    // results were locked (verified_at) keyed on the visit_test ids
    const rUpd = stub.calls.find((c) => c.table === "results" && c.method === "update");
    expect(rUpd).toBeTruthy();
    expect((rUpd!.arg as any).verified_at).toBeTruthy();
    const inCall = stub.calls.find((c) => c.table === "results" && c.method === "in");
    expect(inCall!.arg).toBe("visit_test_id");
  });

  it("skips the results lock when the visit has no tests", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "visit_tests" && methods.includes("select")) return { data: [], error: null };
      return { data: null, error: null };
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(stub.calls.some((c) => c.table === "results" && c.method === "update")).toBe(false);
  });

  it("500 when the visit update errors", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "visits" && methods.includes("update")) return { data: null, error: { message: "boom" } };
      return { data: null, error: null };
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("boom");
  });
});
