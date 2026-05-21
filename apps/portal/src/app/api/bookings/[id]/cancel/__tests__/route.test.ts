import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

// The route is unauthenticated by design (the booking id is the capability),
// so the only mock we need is the Supabase client. We rebuild the stub per test
// because the read (maybeSingle) and the update (.select) need different data.
let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

import { POST } from "../route";

function setStub(spec: ResultSpec) { stub = makeSupabaseStub(spec); }
beforeEach(() => { stub = makeSupabaseStub(); });

function req(): NextRequest {
  return new NextRequest("http://localhost/api/bookings/booking-1/cancel", { method: "POST" });
}
const ctx = { params: { id: "booking-1" } };

describe("POST /api/bookings/[id]/cancel", () => {
  it("404 when the booking does not exist", async () => {
    setStub({ data: null });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("409 not_pending when the booking is already approved", async () => {
    setStub({ data: { id: "row-1", status: "Approved", version: 2 } });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("not_pending");
    expect(body.message).toMatch(/confirmed by the lab/);
  });

  it("cancels a pending booking with optimistic concurrency and returns ok", async () => {
    // Read returns a Pending row; the update's .select("id") must return a row.
    setStub(({ methods }) =>
      methods.includes("update")
        ? { data: [{ id: "row-1" }] }
        : { data: { id: "row-1", status: "Pending", version: 3 } },
    );
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const update = stub.calls.find((c) => c.table === "bookings" && c.method === "update");
    expect(update).toBeTruthy();
    const arg = update!.arg as any;
    expect(arg.status).toBe("Cancelled");
    expect(arg.version).toBe(4); // row.version + 1
    // Reads by the public booking_id, writes guarded by the row id + version.
    const eqCols = stub.calls.filter((c) => c.method === "eq").map((c) => c.arg);
    expect(eqCols).toContain("booking_id"); // the public lookup
    expect(eqCols).toContain("id"); // optimistic-update guard
    expect(eqCols).toContain("version"); // optimistic-update guard
  });

  it("409 conflict when the optimistic update matches no rows", async () => {
    setStub(({ methods }) =>
      methods.includes("update")
        ? { data: [] } // version moved under us
        : { data: { id: "row-1", status: "Pending", version: 3 } },
    );
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("conflict");
  });
});
