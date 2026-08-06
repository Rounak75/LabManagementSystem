// Per-account lockout stops someone guessing at one patient. These cover the
// other shape: one guess against each of thousands of phone numbers, which
// never trips any single account's counter.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

import { issuePuzzle } from "@portal/lib/captcha";
import { CAPTCHA_AFTER_FAILURES } from "@portal/lib/login-throttle";
import { POST } from "../route";

beforeAll(() => { process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa"; });
beforeEach(() => { stub = makeSupabaseStub(); });

/** Stub with a fixed recent-failure count for the origin and no matching patient. */
function withRecentFailures(count: number) {
  const spec: ResultSpec = ({ table }) => {
    if (table.startsWith("rpc:")) return { data: count };
    return { data: [] }; // no patient on this phone
  };
  stub = makeSupabaseStub(spec);
}

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", ...headers }),
    body: JSON.stringify(body),
  });
}

const FROM_ONE_ADDRESS = { "x-real-ip": "203.0.113.9" };

describe("POST /api/auth/login — origin throttling", () => {
  it("does not challenge an origin that has not been failing", async () => {
    withRecentFailures(0);

    const res = await POST(req({ phone: "9876543210", code: "ABC123" }, FROM_ONE_ADDRESS));

    // Reached the credential check rather than being stopped at the gate.
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("no_patient_found");
  });

  it("demands a puzzle once the origin has failed repeatedly", async () => {
    withRecentFailures(CAPTCHA_AFTER_FAILURES);

    const res = await POST(req({ phone: "9876543210", code: "ABC123" }, FROM_ONE_ADDRESS));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("captcha_required");
    expect(body.captchaRequired).toBe(true);
  });

  it("rejects a wrong answer to the puzzle", async () => {
    withRecentFailures(CAPTCHA_AFTER_FAILURES);
    const puzzle = await issuePuzzle();

    const res = await POST(
      req(
        { phone: "9876543210", code: "ABC123", captchaToken: puzzle.token, captchaAnswer: 9999 },
        FROM_ONE_ADDRESS,
      ),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("captcha_required");
  });

  it("lets a solved puzzle through to the credential check", async () => {
    withRecentFailures(CAPTCHA_AFTER_FAILURES);
    const puzzle = await issuePuzzle();
    const answer = Number(/What is (\d+) \+ (\d+)\?/.exec(puzzle.question)!.slice(1, 3)
      .reduce((a, b) => Number(a) + Number(b), 0));

    const res = await POST(
      req(
        { phone: "9876543210", code: "ABC123", captchaToken: puzzle.token, captchaAnswer: answer },
        FROM_ONE_ADDRESS,
      ),
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("no_patient_found");
  });

  it("counts a failed login against the origin", async () => {
    withRecentFailures(0);

    await POST(req({ phone: "9876543210", code: "ABC123" }, FROM_ONE_ADDRESS));

    expect(stub.rpcCalls.map((c) => c.name)).toContain("record_failed_login_origin");
  });

  // A NAT'd clinic or a platform that strips the header must not become an
  // unauthenticated bypass, nor a hard failure.
  it("still checks credentials when no address is available", async () => {
    withRecentFailures(0);

    const res = await POST(req({ phone: "9876543210", code: "ABC123" }));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("no_patient_found");
  });
});

/**
 * The way in for a patient who booked online and has never held a receipt.
 */
describe("POST /api/auth/login — signing in with a booking id", () => {
  const BOOKING = "BKG-2026-00007";

  function withBooking(over: Record<string, unknown> = {}) {
    stub = makeSupabaseStub(({ table }) => {
      if (table.startsWith("rpc:")) return { data: 0 };
      if (table === "bookings") {
        return {
          data: {
            id: "b1",
            booking_id: BOOKING,
            patient_phone: "9876543210",
            status: "Approved",
            resulting_patient_id: "p1",
            ...over,
          },
        };
      }
      if (table === "patient_accounts") return { data: { id: "acc1", patient_id: "p1" } };
      return { data: null };
    });
  }

  it("signs the patient in and sets the session cookie", async () => {
    withBooking();

    const res = await POST(req({ phone: "9876543210", firstTimeId: BOOKING }, FROM_ONE_ADDRESS));

    expect(res.status).toBe(200);
    expect(res.cookies.get("portal_session")?.value).toBeTruthy();
  });

  // The booking id is guessable by counting, so it buys one visit and no more.
  // Landing anywhere else would leave that credential live indefinitely.
  it("sends them straight to choosing a password", async () => {
    withBooking();

    const res = await POST(req({ phone: "9876543210", firstTimeId: BOOKING }, FROM_ONE_ADDRESS));

    const body = await res.json();
    expect(body.mustSetPassword).toBe(true);
    expect(body.redirectTo).toBe("/account/password?first=1");
  });

  it("ignores a `next` that would skip choosing a password", async () => {
    withBooking();

    const res = await POST(
      req({ phone: "9876543210", firstTimeId: BOOKING, next: "/dashboard" }, FROM_ONE_ADDRESS),
    );

    expect((await res.json()).redirectTo).toBe("/account/password?first=1");
  });

  // "Your booking is confirmed but the lab has not filed it yet" is a different
  // thing from "wrong details", and telling a patient the latter sends them
  // looking for a mistake they did not make.
  it("explains when the booking has not become a visit yet", async () => {
    withBooking({ resulting_patient_id: null });

    const res = await POST(req({ phone: "9876543210", firstTimeId: BOOKING }, FROM_ONE_ADDRESS));

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("booking_not_ready");
  });

  it("rejects a booking id on the wrong phone number", async () => {
    withBooking({ patient_phone: "9111111111" });

    const res = await POST(req({ phone: "9876543210", firstTimeId: BOOKING }, FROM_ONE_ADDRESS));

    expect(res.status).toBe(401);
  });
});

/**
 * Patients get one field, not a tab they have to choose correctly. Whichever id
 * the lab gave them — spoken at the counter, or emailed with a home-collection
 * confirmation — goes in the same box, and the prefix decides what it is.
 */
describe("POST /api/auth/login — telling the two first-time ids apart", () => {
  it("treats a LAB- id as a walk-in patient id", async () => {
    stub = makeSupabaseStub(({ table }) => {
      if (table.startsWith("rpc:")) return { data: 0 };
      if (table === "patients") {
        return { data: { id: "p1", patient_id: "LAB-2026-00042", phone: "9876543210" } };
      }
      if (table === "patient_accounts") return { data: { id: "acc1", patient_id: "p1" } };
      return { data: null };
    });

    const res = await POST(
      req({ phone: "9876543210", firstTimeId: "LAB-2026-00042" }, FROM_ONE_ADDRESS),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).redirectTo).toBe("/account/password?first=1");
    // Resolved against patients, not bookings.
    expect(stub.calls.some((c) => c.table === "patients")).toBe(true);
    expect(stub.calls.some((c) => c.table === "bookings")).toBe(false);
  });

  it("treats a BKG- id as a booking id", async () => {
    stub = makeSupabaseStub(({ table }) => {
      if (table.startsWith("rpc:")) return { data: 0 };
      if (table === "bookings") {
        return {
          data: {
            id: "b1",
            booking_id: "BKG-2026-00007",
            patient_phone: "9876543210",
            status: "Approved",
            resulting_patient_id: "p1",
          },
        };
      }
      if (table === "patient_accounts") return { data: { id: "acc1", patient_id: "p1" } };
      return { data: null };
    });

    const res = await POST(
      req({ phone: "9876543210", firstTimeId: "BKG-2026-00007" }, FROM_ONE_ADDRESS),
    );

    expect(res.status).toBe(200);
    expect(stub.calls.some((c) => c.table === "bookings")).toBe(true);
  });

  it("is not upset by lower case or stray spaces", async () => {
    stub = makeSupabaseStub(({ table }) => {
      if (table.startsWith("rpc:")) return { data: 0 };
      if (table === "patients") {
        return { data: { id: "p1", patient_id: "LAB-2026-00042", phone: "9876543210" } };
      }
      if (table === "patient_accounts") return { data: { id: "acc1", patient_id: "p1" } };
      return { data: null };
    });

    const res = await POST(
      req({ phone: "9876543210", firstTimeId: "  lab-2026-00042  " }, FROM_ONE_ADDRESS),
    );

    expect(res.status).toBe(200);
  });
});
