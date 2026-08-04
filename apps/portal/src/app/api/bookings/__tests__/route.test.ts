import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

let captchaOk = true;
vi.mock("@portal/lib/captcha", () => ({ verifyPuzzle: async () => captchaOk }));

import { POST } from "../route";

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/bookings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** A date the lab could still collect on. Fixed dates rot: this fixture carried
 *  2026-08-02, which quietly became a past date the route is right to refuse. */
function daysFromNow(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const valid = {
  captchaToken: "t",
  captchaAnswer: 4,
  patientName: "Sujata Mahato",
  patientPhone: "9876543210",
  address: "Golmuri, Jamshedpur",
  pincode: "831003",
  testIds: ["t1"],
  preferredDate: daysFromNow(7),
  preferredSlot: "Morning",
};

/** No recent duplicate; the id allocator returns a booking id. */
const happyPath: ResultSpec = ({ table }) => {
  if (table === "rpc:next_booking_id") return { data: "BKG-2026-00007", error: null };
  if (table === "bookings") return { data: [], error: null };
  return { data: null, error: null };
};

beforeEach(() => {
  captchaOk = true;
  stub = makeSupabaseStub(happyPath);
});

describe("POST /api/bookings", () => {
  it("rejects a failed captcha before touching the database", async () => {
    captchaOk = false;
    const res = await POST(req(valid));
    expect(res.status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });

  it("rejects a phone that is not 10 digits", async () => {
    expect((await POST(req({ ...valid, patientPhone: "12345" }))).status).toBe(400);
  });

  // 0–5 are landline trunk prefixes and service codes: they can take neither the
  // confirmation call nor an SMS, so a number in that shape is always a typo.
  // It matters more than a plain format check because an approved booking writes
  // this number onto a Patient, where it becomes that patient's portal login.
  it.each(["0876543210", "1876543210", "2876543210", "3876543210", "4876543210", "5876543210"])(
    "rejects the mobile number %s, which cannot start with that digit",
    async (patientPhone) => {
      const res = await POST(req({ ...valid, patientPhone }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("bad_phone");
      expect(stub.calls.some((c) => c.method === "insert")).toBe(false);
    },
  );

  it.each(["6876543210", "7876543210", "8876543210", "9876543210"])(
    "accepts the mobile number %s",
    async (patientPhone) => {
      expect((await POST(req({ ...valid, patientPhone }))).status).toBe(200);
    },
  );

  it("rejects a booking with no tests", async () => {
    expect((await POST(req({ ...valid, testIds: [] }))).status).toBe(400);
  });

  // A wrong-length PIN code was previously coerced to null and saved, so the
  // booking reached staff looking complete and the phlebotomist discovered the
  // gap at the door.
  it.each([
    ["missing", undefined],
    ["too short", "8310"],
    ["not digits", "abcdef"],
  ])("rejects a PIN code that is %s", async (_label, pincode) => {
    const res = await POST(req({ ...valid, pincode }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_pincode");
    expect(stub.calls.some((c) => c.method === "insert")).toBe(false);
  });

  // The form offered every slot of the current day whatever the time, so at 7pm
  // a patient could book the 4pm–7pm window — a collection only possible in the
  // past. The form no longer offers it; this is the half that a direct POST hits.
  it("rejects a slot that has already passed today", async () => {
    vi.useFakeTimers();
    try {
      // 19:30 IST — the evening window (16:00–19:00) has closed.
      vi.setSystemTime(new Date("2026-08-04T14:00:00Z"));
      const res = await POST(
        req({ ...valid, preferredDate: "2026-08-04", preferredSlot: "Evening" }),
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("slot_passed");
      expect(stub.calls.some((c) => c.method === "insert")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still accepts a slot later the same day", async () => {
    vi.useFakeTimers();
    try {
      // 09:30 IST — the evening window is hours away.
      vi.setSystemTime(new Date("2026-08-04T04:00:00Z"));
      const res = await POST(
        req({ ...valid, preferredDate: "2026-08-04", preferredSlot: "Evening" }),
      );

      expect(res.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  // Booking numbers used to be minted by counting the year's bookings and adding
  // one. Two people booking at the same moment built the same id, and
  // bookings.booking_id is unique — so the second patient's request failed and
  // was lost behind a generic "please try again".
  it("allocates the booking id atomically in the database", async () => {
    const res = await POST(req(valid));

    expect(res.status).toBe(200);
    expect((await res.json()).bookingId).toBe("BKG-2026-00007");

    const rpc = stub.rpcCalls.find((c) => c.name === "next_booking_id");
    expect(rpc).toBeTruthy();
    expect((rpc!.args as Record<string, unknown>).p_year).toBe(new Date().getUTCFullYear());

    // Never derived from a count of the bookings table.
    expect(stub.calls.some((c) => c.table === "bookings" && c.method === "insert")).toBe(true);
  });

  it("saves the booking against the allocated id", async () => {
    await POST(req(valid));
    const insert = stub.calls.find((c) => c.table === "bookings" && c.method === "insert");
    const row = insert!.arg as Record<string, unknown>;
    expect(row.booking_id).toBe("BKG-2026-00007");
    expect(row.patient_phone).toBe("9876543210");
    expect(row.status).toBe("Pending");
  });

  it("tells the patient their booking was not saved when the id cannot be allocated", async () => {
    stub = makeSupabaseStub(({ table }) => {
      if (table === "rpc:next_booking_id") return { data: null, error: { message: "deadlock" } };
      return { data: [], error: null };
    });

    const res = await POST(req(valid));

    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/could not save/i);
    // No half-written booking left behind.
    expect(stub.calls.some((c) => c.table === "bookings" && c.method === "insert")).toBe(false);
  });

  // A double-tapped submit button should not book the same visit twice.
  it("returns the existing booking when the same phone and date was just submitted", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "bookings" && methods.includes("select")) {
        return { data: [{ booking_id: "BKG-2026-00003" }], error: null };
      }
      if (table === "rpc:next_booking_id") return { data: "BKG-2026-00008", error: null };
      return { data: null, error: null };
    });

    const res = await POST(req(valid));
    const json = await res.json();

    expect(json).toMatchObject({ bookingId: "BKG-2026-00003", deduped: true });
    expect(stub.rpcCalls).toHaveLength(0);
    expect(stub.calls.some((c) => c.table === "bookings" && c.method === "insert")).toBe(false);
  });
});
