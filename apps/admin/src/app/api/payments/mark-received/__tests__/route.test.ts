import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";

let sessionUser: { id: string; token: string } | null = { id: "admin-1", token: "tok" };
vi.mock("@/lib/auth-session", () => ({ getSessionUser: () => sessionUser }));

let stub = makeSupabaseStub({ data: null, error: null });
vi.mock("@/lib/supabase-client", () => ({ getServerSupabase: () => stub.client }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/payments/mark-received", { method: "POST", body: JSON.stringify(body) });
}
beforeEach(() => { sessionUser = { id: "admin-1", token: "tok" }; });

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
    stub = makeSupabaseStub(({ table }) => {
      if (table === "invoices") return { data: null, error: { message: "no rows" } };
      return { data: null, error: null };
    });
    const res = await POST(req({ invoice_id: "missing", amount: 100 }));
    expect(res.status).toBe(404);
  });

  it("partial payment: inserts payment (UPI_Direct) and updates invoice to Partial", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "invoices" && methods.includes("select")) {
        return { data: { id: "inv1", visit_id: "v1", total: 500, amount_paid: 100, payment_status: "Partial" }, error: null };
      }
      return { data: null, error: null };
    });
    const res = await POST(req({ invoice_id: "inv1", amount: 200, reference: "UTR123" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.payment_status).toBe("Partial");

    const pay = stub.calls.find((c) => c.table === "payments" && c.method === "insert");
    expect(pay).toBeTruthy();
    expect((pay!.arg as any).method).toBe("UPI_Direct");
    expect((pay!.arg as any).amount).toBe(200);
    expect((pay!.arg as any).invoice_id).toBe("inv1");
    expect((pay!.arg as any).reference).toBe("UTR123");
    expect((pay!.arg as any).received_by_user_id).toBe("admin-1");

    const upd = stub.calls.find((c) => c.table === "invoices" && c.method === "update");
    expect(upd).toBeTruthy();
    expect((upd!.arg as any).amount_paid).toBe(300); // 100 + 200
    expect((upd!.arg as any).payment_status).toBe("Partial");
  });

  it("full payment: marks invoice Paid when paid >= total", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "invoices" && methods.includes("select")) {
        return { data: { id: "inv1", visit_id: "v1", total: 500, amount_paid: 400, payment_status: "Partial" }, error: null };
      }
      return { data: null, error: null };
    });
    const res = await POST(req({ invoice_id: "inv1", amount: 100 }));
    expect(res.status).toBe(200);
    expect((await res.json()).payment_status).toBe("Paid");
    const upd = stub.calls.find((c) => c.table === "invoices" && c.method === "update");
    expect((upd!.arg as any).amount_paid).toBe(500);
    expect((upd!.arg as any).payment_status).toBe("Paid");
  });

  it("500 when the payment insert errors", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "invoices" && methods.includes("select")) {
        return { data: { id: "inv1", visit_id: "v1", total: 500, amount_paid: 0, payment_status: "Pending" }, error: null };
      }
      if (table === "payments" && methods.includes("insert")) return { data: null, error: { message: "insert failed" } };
      return { data: null, error: null };
    });
    const res = await POST(req({ invoice_id: "inv1", amount: 100 }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("insert failed");
  });
});
