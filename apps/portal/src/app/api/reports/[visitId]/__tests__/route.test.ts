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
const ctx = { params: Promise.resolve({ visitId: "v1" }) };

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

  function visitWithTests(
    visitTests: unknown[],
    opts: { invoice?: unknown; override?: boolean } = {},
  ) {
    return ({ table }: { table: string }) => {
      if (table === "visits") {
        return {
          data: {
            id: "v1",
            patient_id: "patient-1",
            visit_id: "VST-1",
            visit_date: "2026-05-01",
            report_release_override: opts.override ?? false,
            patients: { name: "A", age: 30, sex: "Male", phone: "9" },
            invoices: opts.invoice ?? null,
            visit_tests: visitTests,
          },
        };
      }
      if (table === "lab_settings") return { data: { lab_name: "Lab" } };
      return { data: [] }; // parameters
    };
  }

  const lockedTest = { id: "vt1", test_id: "t1", is_locked: true, tests: { name: "CBC", category: "Hematology" }, results: [] };

  it("streams a PDF for the visit's owner once every test is verified and locked", async () => {
    setStub(visitWithTests([lockedTest]));
    const token = await mintPatientJwt("patient-1");
    const res = await GET(req(token), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="VST-1.pdf"');
    expect(renderToStream).toHaveBeenCalledTimes(1);
    // The visit id from the route must reach the query. With an unawaited Next 15
    // `params` this is undefined, and every assertion above still passes — which
    // on this endpoint would mean serving a report for the wrong visit.
    expect(
      stub.calls.some((c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === "v1"),
    ).toBe(true);
  });

  // The PDF carries the pathologist's name and qualifications, so it reads as a
  // signed report. It must not be obtainable while any value is still a draft:
  // the patient is only told the report is ready after verification (the
  // reportReady notification), and this endpoint must hold the same line.
  describe("unverified results", () => {
    it("refuses the report when a test is not yet locked", async () => {
      setStub(visitWithTests([lockedTest, { ...lockedTest, id: "vt2", is_locked: false }]));
      const token = await mintPatientJwt("patient-1");

      const res = await GET(req(token), ctx);

      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("report_not_ready");
      expect(renderToStream).not.toHaveBeenCalled();
    });

    it("refuses the report when no test is locked", async () => {
      setStub(visitWithTests([{ ...lockedTest, is_locked: false }]));
      const token = await mintPatientJwt("patient-1");

      const res = await GET(req(token), ctx);

      expect(res.status).toBe(409);
      expect(renderToStream).not.toHaveBeenCalled();
    });

    it("treats a null lock flag as not locked", async () => {
      setStub(visitWithTests([{ ...lockedTest, is_locked: null }]));
      const token = await mintPatientJwt("patient-1");

      const res = await GET(req(token), ctx);

      expect(res.status).toBe(409);
      expect(renderToStream).not.toHaveBeenCalled();
    });

    it("refuses a visit that has no tests at all", async () => {
      setStub(visitWithTests([]));
      const token = await mintPatientJwt("patient-1");

      const res = await GET(req(token), ctx);

      expect(res.status).toBe(409);
      expect(renderToStream).not.toHaveBeenCalled();
    });
  });

  // The lab's money used to depend on the patient coming back to the counter:
  // this endpoint handed over the PDF whether or not the bill had been paid.
  describe("unpaid bills", () => {
    it("refuses a verified report while money is still owed, and says how much", async () => {
      setStub(visitWithTests([lockedTest], { invoice: { total: 500, amount_paid: 300 } }));
      const token = await mintPatientJwt("patient-1");

      const res = await GET(req(token), ctx);

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.error).toBe("payment_required");
      expect(body.balance).toBe(200);
      expect(renderToStream).not.toHaveBeenCalled();
    });

    it("streams the report once the bill is settled", async () => {
      setStub(visitWithTests([lockedTest], { invoice: { total: 500, amount_paid: 500 } }));
      const token = await mintPatientJwt("patient-1");

      const res = await GET(req(token), ctx);

      expect(res.status).toBe(200);
      expect(renderToStream).toHaveBeenCalledTimes(1);
    });

    it("streams the report for a visit that was never billed", async () => {
      setStub(visitWithTests([lockedTest], { invoice: null }));
      const token = await mintPatientJwt("patient-1");

      expect((await GET(req(token), ctx)).status).toBe(200);
    });

    // PostgREST returns an embedded one-to-one as an array.
    it("reads the invoice when it arrives as an array", async () => {
      setStub(visitWithTests([lockedTest], { invoice: [{ total: 500, amount_paid: 0 }] }));
      const token = await mintPatientJwt("patient-1");

      const res = await GET(req(token), ctx);

      expect(res.status).toBe(402);
      expect((await res.json()).balance).toBe(500);
    });

    it("releases an unpaid report the Admin has overridden", async () => {
      setStub(
        visitWithTests([lockedTest], { invoice: { total: 500, amount_paid: 0 }, override: true }),
      );
      const token = await mintPatientJwt("patient-1");

      const res = await GET(req(token), ctx);

      expect(res.status).toBe(200);
      expect(renderToStream).toHaveBeenCalledTimes(1);
    });

    // The override waives the bill, never the pathologist's sign-off.
    it("still refuses an unverified report even when overridden", async () => {
      setStub(
        visitWithTests([{ ...lockedTest, is_locked: false }], {
          invoice: { total: 500, amount_paid: 0 },
          override: true,
        }),
      );
      const token = await mintPatientJwt("patient-1");

      const res = await GET(req(token), ctx);

      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("report_not_ready");
      expect(renderToStream).not.toHaveBeenCalled();
    });
  });
});
