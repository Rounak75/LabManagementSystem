import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

// Keep the test fast & PDF-free: stub the renderer and the report component.
// vi.mock is hoisted, so the fn must be created via vi.hoisted to be in scope.
const { renderToStream } = vi.hoisted(() => ({ renderToStream: vi.fn(async () => new ReadableStream()) }));
vi.mock("@react-pdf/renderer", () => ({ renderToStream }));
vi.mock("@lab/reports", () => ({ LabReport: () => null }));

import { mintPatientJwt } from "@portal/lib/jwt";
import { GET } from "../route";

beforeAll(() => { process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa"; });
beforeEach(() => { stub = makeSupabaseStub(); renderToStream.mockClear(); });
function setStub(spec: ResultSpec) { stub = makeSupabaseStub(spec); }

function req(token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set("cookie", `portal_session=${token}`);
  return new NextRequest("http://localhost/api/reports/v1", { method: "GET", headers });
}
const ctx = { params: { visitId: "v1" } };

describe("GET /api/reports/[visitId]", () => {
  it("401 when not logged in", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("not_logged_in");
  });

  it("401 on an invalid token", async () => {
    const res = await GET(req("garbage.token.value"), ctx);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  it("404 when the visit belongs to a different patient", async () => {
    setStub({ data: { id: "v1", patient_id: "other-patient", visit_id: "VST-1" } });
    const token = await mintPatientJwt("patient-1");
    const res = await GET(req(token), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
    expect(renderToStream).not.toHaveBeenCalled();
  });

  it("streams a PDF for the visit's owner", async () => {
    setStub(({ table }) => {
      if (table === "visits") {
        return { data: { id: "v1", patient_id: "patient-1", visit_id: "VST-1", visit_date: "2026-05-01", patients: { name: "A", age: 30, sex: "Male", phone: "9" }, visit_tests: [] } };
      }
      if (table === "lab_settings") return { data: { lab_name: "Lab" } };
      return { data: [] }; // parameters
    });
    const token = await mintPatientJwt("patient-1");
    const res = await GET(req(token), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="VST-1.pdf"');
    expect(renderToStream).toHaveBeenCalledTimes(1);
  });
});
