import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

// The route is no longer unauthenticated: cancelling requires having proved the
// phone number on the booking, because `BKG-YYYY-NNNNN` counts upwards and
// treating it as the capability meant counting through it cancelled the lab's
// whole home-visit book. The stub is rebuilt per test because the read
// (maybeSingle) and the update (.select) need different data.
let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

import { POST } from "../route";
import { BOOKING_ACCESS_COOKIE, mintBookingAccess } from "@portal/lib/booking-access";

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa";
});

function setStub(spec: ResultSpec) { stub = makeSupabaseStub(spec); }
beforeEach(() => { stub = makeSupabaseStub(); });

/** A request carrying proof of the phone number on `booking-1`. */
function req(token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set("cookie", `${BOOKING_ACCESS_COOKIE}=${token}`);
  return new NextRequest("http://localhost/api/bookings/booking-1/cancel", {
    method: "POST",
    headers,
  });
}
async function unlockedReq(): Promise<NextRequest> {
  return req(await mintBookingAccess("booking-1"));
}
const ctx = { params: Promise.resolve({ id: "booking-1" }) };

describe("POST /api/bookings/[id]/cancel — proving the booking is yours", () => {
  it("refuses a caller who has not confirmed the phone number", async () => {
    setStub({ data: { id: "row-1", status: "Pending", version: 3 } });

    const res = await POST(req(), ctx);

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("not_verified");
  });

  // The attack this whole change exists to stop: counting through the sequence
  // with a token legitimately obtained for one's own booking.
  it("refuses a token minted for somebody else's booking", async () => {
    setStub({ data: { id: "row-1", status: "Pending", version: 3 } });

    const res = await POST(req(await mintBookingAccess("booking-2")), ctx);

    expect(res.status).toBe(401);
  });

  // Refused before the row is read, so a refusal cannot be timed or otherwise
  // used to learn whether the booking exists.
  it("does not touch the database when it refuses", async () => {
    setStub({ data: { id: "row-1", status: "Pending", version: 3 } });

    await POST(req(), ctx);

    expect(stub.calls).toHaveLength(0);
  });
});

describe("POST /api/bookings/[id]/cancel", () => {
  it("404 when the booking does not exist", async () => {
    setStub({ data: null });
    const res = await POST(await unlockedReq(), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("409 not_pending when the booking is already approved", async () => {
    setStub({ data: { id: "row-1", status: "Approved", version: 2 } });
    const res = await POST(await unlockedReq(), ctx);
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
    const res = await POST(await unlockedReq(), ctx);
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
    // The booking id from the route must be what the lookup filters on; an
    // unawaited Next 15 `params` would leave it undefined and still land here.
    expect(
      stub.calls.some(
        (c) => c.method === "eq" && c.args[0] === "booking_id" && c.args[1] === "booking-1",
      ),
    ).toBe(true);
  });

  it("409 conflict when the optimistic update matches no rows", async () => {
    setStub(({ methods }) =>
      methods.includes("update")
        ? { data: [] } // version moved under us
        : { data: { id: "row-1", status: "Pending", version: 3 } },
    );
    const res = await POST(await unlockedReq(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("conflict");
  });
});
