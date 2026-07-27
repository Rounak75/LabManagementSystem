import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";

let sessionUser: { id: string; token: string } | null = { id: "admin-1", token: "tok" };
vi.mock("@/lib/auth-session", () => ({ getSessionUser: () => sessionUser }));

let stub = makeSupabaseStub({ data: null, error: null });
vi.mock("@/lib/supabase-client", () => ({ getServerSupabase: () => stub.client }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/payments/mark-received", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** The RPC returns the payment id and the invoice's new state. */
function rpcReturns(row: { payment_id: string; amount_paid: number; payment_status: string }) {
  return makeSupabaseStub(({ table }) =>
    table === "rpc:record_invoice_payment" ? { data: [row], error: null } : { data: null, error: null },
  );
}

beforeEach(() => {
  sessionUser = { id: "admin-1", token: "tok" };
});

describe("POST /api/payments/mark-received", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    stub = makeSupabaseStub({ data: null, error: null });
    expect((await POST(req({ invoice_id: "inv1", amount: 100 }))).status).toBe(401);
  });

  it("400 on invalid body (missing invoice_id or non-positive amount)", async () => {
    stub = makeSupabaseStub({ data: null, error: null });
    expect((await POST(req({ amount: 100 }))).status).toBe(400);
    expect((await POST(req({ invoice_id: "inv1", amount: 0 }))).status).toBe(400);
    expect((await POST(req({ invoice_id: "inv1", amount: -5 }))).status).toBe(400);
  });

  it("404 when the invoice is not found", async () => {
    stub = makeSupabaseStub(({ table }) =>
      table === "rpc:record_invoice_payment"
        ? { data: null, error: { message: "invoice not found: missing", code: "P0002" } }
        : { data: null, error: null },
    );

    const res = await POST(req({ invoice_id: "missing", amount: 100 }));

    expect(res.status).toBe(404);
  });

  // The balance was previously read, added to in JavaScript, and written back, so
  // two staff recording payments on one invoice at the same time both started
  // from the same figure and one payment silently vanished from the invoice while
  // its payments row survived. The arithmetic has to happen in the database.
  it("records the payment in a single atomic call", async () => {
    stub = rpcReturns({ payment_id: "pay-1", amount_paid: 300, payment_status: "Partial" });

    const res = await POST(req({ invoice_id: "inv1", amount: 200, reference: "UTR123" }));

    expect(res.status).toBe(200);
    expect(stub.rpcCalls).toHaveLength(1);
    expect(stub.rpcCalls[0]!.name).toBe("record_invoice_payment");
    expect(stub.rpcCalls[0]!.args).toMatchObject({
      p_invoice_id: "inv1",
      p_amount: 200,
      p_method: "UPI_Direct",
      p_reference: "UTR123",
      p_received_by: "admin-1",
    });
  });

  it("never computes the new balance itself", async () => {
    stub = rpcReturns({ payment_id: "pay-1", amount_paid: 300, payment_status: "Partial" });

    await POST(req({ invoice_id: "inv1", amount: 200 }));

    // No read-modify-write on invoices, and no separate payments insert.
    expect(stub.calls.some((c) => c.table === "invoices" && c.method === "update")).toBe(false);
    expect(stub.calls.some((c) => c.table === "payments" && c.method === "insert")).toBe(false);
  });

  it("reports the status the database computed", async () => {
    stub = rpcReturns({ payment_id: "pay-2", amount_paid: 500, payment_status: "Paid" });

    const res = await POST(req({ invoice_id: "inv1", amount: 100 }));

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.payment_status).toBe("Paid");
  });

  it("500 when the atomic write fails", async () => {
    stub = makeSupabaseStub(({ table }) =>
      table === "rpc:record_invoice_payment"
        ? { data: null, error: { message: "insert failed" } }
        : { data: null, error: null },
    );

    const res = await POST(req({ invoice_id: "inv1", amount: 100 }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("insert failed");
  });

  it("still writes an audit entry", async () => {
    stub = rpcReturns({ payment_id: "pay-1", amount_paid: 300, payment_status: "Partial" });

    await POST(req({ invoice_id: "inv1", amount: 200 }));

    expect(stub.calls.some((c) => c.table === "audit_logs" && c.method === "insert")).toBe(true);
  });
});
