import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";

let sessionUser: { id: string; token: string } | null = { id: "staff-1", token: "tok" };
vi.mock("@/lib/auth-session", () => ({ getSessionUser: () => sessionUser }));

// The route now creates the visit, its tests and its invoice in one database
// function, so the stub answers the RPC rather than a chain of inserts.
let rpcResult: { data?: unknown; error?: unknown } = {
  data: [
    {
      visit_id: "v-uuid",
      invoice_id: "inv-uuid",
      subtotal: 500,
      amount_paid: 300,
      payment_status: "Partial",
    },
  ],
  error: null,
};
const stub = makeSupabaseStub(() => rpcResult);
vi.mock("@/lib/supabase-client", () => ({ getServerSupabase: () => stub.client }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/visits/create", { method: "POST", body: JSON.stringify(body) });
}

const validBody = {
  patientId: "p1",
  allocatedVisitId: "VIS-2026-00001",
  visitDate: "2026-05-22",
  testIds: ["t1", "t2"],
};

beforeEach(() => {
  sessionUser = { id: "staff-1", token: "tok" };
  stub.calls.length = 0;
  stub.rpcCalls.length = 0;
  stub.client.from.mockClear();
  stub.client.rpc.mockClear();
  rpcResult = {
    data: [
      {
        visit_id: "v-uuid",
        invoice_id: "inv-uuid",
        subtotal: 500,
        amount_paid: 300,
        payment_status: "Partial",
      },
    ],
    error: null,
  };
});

describe("POST /api/visits/create", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    expect((await POST(req({}))).status).toBe(401);
  });

  it("400 on invalid body", async () => {
    expect((await POST(req({ patientId: "" }))).status).toBe(400);
  });

  it("creates the visit, its tests and its invoice in one call", async () => {
    const res = await POST(req(validBody));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.id).toBe("string");

    const call = stub.rpcCalls.find((c) => c.name === "create_visit_with_invoice");
    expect(call).toBeTruthy();
    const args = call!.args as Record<string, unknown>;
    expect(args.p_patient_id).toBe("p1");
    expect(args.p_visit_code).toBe("VIS-2026-00001");
    expect(args.p_test_ids).toEqual(["t1", "t2"]);
    expect(args.p_staff_id).toBe("staff-1");
  });

  // A staff-portal visit used to be created with no invoice at all, so the patient
  // never appeared in /payments, never got a Pay button on the portal, and never
  // counted towards the day's money.
  it("returns the invoice it created", async () => {
    const json = await (await POST(req(validBody))).json();
    expect(json.invoiceId).toBe("inv-uuid");
    expect(json.subtotal).toBe(500);
    expect(json.paymentStatus).toBe("Partial");
  });

  it("passes the counter payment through when the patient paid something", async () => {
    await POST(req({ ...validBody, amountPaid: 300, paymentMethod: "Cash" }));
    const args = stub.rpcCalls[0]!.args as Record<string, unknown>;
    expect(args.p_amount_paid).toBe(300);
    expect(args.p_payment_method).toBe("Cash");
    expect(args.p_received_by).toBe("staff-1");
  });

  it("defaults to nothing paid when the patient has not paid yet", async () => {
    await POST(req(validBody));
    const args = stub.rpcCalls[0]!.args as Record<string, unknown>;
    expect(args.p_amount_paid).toBe(0);
    expect(args.p_payment_method).toBeNull();
  });

  it("rejects a negative payment before it reaches the database", async () => {
    expect((await POST(req({ ...validBody, amountPaid: -1 }))).status).toBe(400);
  });

  // The function prices the visit from the catalogue and refuses a payment above
  // the total, so a tampered request is the caller's fault, not a server fault.
  it("400s when the database rejects the request as invalid", async () => {
    rpcResult = { data: null, error: { code: "23514", message: "payment exceeds the visit total" } };
    const res = await POST(req({ ...validBody, amountPaid: 99999 }));
    expect(res.status).toBe(400);
  });

  it("403s when the caller's role is not allowed to create visits", async () => {
    rpcResult = { data: null, error: { code: "42501", message: "not authorised" } };
    expect((await POST(req(validBody))).status).toBe(403);
  });

  it("500s on an unexpected database failure", async () => {
    rpcResult = { data: null, error: { code: "08006", message: "connection failure" } };
    expect((await POST(req(validBody))).status).toBe(500);
  });
});
