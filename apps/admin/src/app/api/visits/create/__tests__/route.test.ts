import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";

let sessionUser: { id: string; token: string } | null = { id: "staff-1", token: "tok" };
vi.mock("@/lib/auth-session", () => ({ getSessionUser: () => sessionUser }));
const stub = makeSupabaseStub({ data: null, error: null });
vi.mock("@/lib/supabase-client", () => ({ getServerSupabase: () => stub.client }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/visits/create", { method: "POST", body: JSON.stringify(body) });
}
beforeEach(() => { sessionUser = { id: "staff-1", token: "tok" }; stub.calls.length = 0; stub.client.from.mockClear(); });

describe("POST /api/visits/create", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    expect((await POST(req({}))).status).toBe(401);
  });
  it("400 on invalid body", async () => {
    expect((await POST(req({ patientId: "" }))).status).toBe(400);
  });
  it("creates a visit + visit_tests and returns an id", async () => {
    const body = {
      patientId: "p1",
      allocatedVisitId: "VIS-2026-00001",
      visitDate: "2026-05-22",
      testIds: ["t1", "t2"],
    };
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(typeof (await res.json()).id).toBe("string");
    const v = stub.calls.find((c) => c.table === "visits" && c.method === "insert");
    expect(v).toBeTruthy();
    expect((v!.arg as any).patient_id).toBe("p1");
    expect((v!.arg as any).visit_id).toBe("VIS-2026-00001");
    expect((v!.arg as any).status).toBe("Open");
    const vt = stub.calls.find((c) => c.table === "visit_tests" && c.method === "insert");
    expect((vt!.arg as any[]).length).toBe(2);
    expect((vt!.arg as any[])[0].status).toBe("Collected");
  });
});
