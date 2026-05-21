import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

import { mintPatientJwt } from "@portal/lib/jwt";
import { POST } from "../route";

beforeAll(() => { process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa"; });
beforeEach(() => { stub = makeSupabaseStub(); });
function setStub(spec: ResultSpec) { stub = makeSupabaseStub(spec); }

function req(body: unknown, token?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `portal_session=${token}`);
  return new NextRequest("http://localhost/api/payment-claims", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/payment-claims", () => {
  it("401 when not logged in", async () => {
    const res = await POST(req({ invoiceId: "inv-1" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("not_logged_in");
  });

  it("400 when invoiceId is missing", async () => {
    const token = await mintPatientJwt("patient-1");
    const res = await POST(req({}, token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_invoice");
  });

  it("404 when the invoice does not belong to the patient", async () => {
    // Invoice's visit belongs to a different patient.
    setStub({ data: { id: "inv-1", visits: { patient_id: "someone-else" } } });
    const token = await mintPatientJwt("patient-1");
    const res = await POST(req({ invoiceId: "inv-1" }, token));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("inserts a payment_claim for an owned invoice and returns ok", async () => {
    setStub(({ table }) =>
      table === "invoices"
        ? { data: { id: "inv-1", visits: { patient_id: "patient-1" } } }
        : { data: null },
    );
    const token = await mintPatientJwt("patient-1");
    const res = await POST(req({ invoiceId: "inv-1" }, token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const insert = stub.calls.find((c) => c.table === "payment_claims" && c.method === "insert");
    expect(insert).toBeTruthy();
    const arg = insert!.arg as any;
    expect(arg.invoice_id).toBe("inv-1");
    expect(typeof arg.claimed_at).toBe("string");
    expect(typeof arg.expires_at).toBe("string");
    // expires_at is ~24h after claimed_at.
    expect(new Date(arg.expires_at).getTime() - new Date(arg.claimed_at).getTime())
      .toBe(24 * 60 * 60_000);
  });
});
