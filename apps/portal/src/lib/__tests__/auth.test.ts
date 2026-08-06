import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

import {
  tryLogin,
  tryPasswordLogin,
  tryBookingIdLogin,
  tryPatientIdLogin,
  ACCESS_CODE_VALID_DAYS,
} from "../auth";

function setStub(spec: ResultSpec) {
  stub = makeSupabaseStub(spec);
}

const CODE = "AB2345";
let codeHash: string;
let passwordHash: string;

beforeAll(async () => {
  process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa";
  codeHash = await bcrypt.hash(CODE, 4);
  passwordHash = await bcrypt.hash("correct horse", 4);
});

const recentVisit = () => ({
  id: "v1",
  access_code_hash: codeHash,
  visit_date: new Date().toISOString(),
});

/** One patient on the phone, an account row, and one recent visit. */
function singlePatient(over: { visits?: unknown[]; account?: unknown } = {}): ResultSpec {
  return ({ table }) => {
    if (table === "patients") {
      return { data: [{ id: "p1", name: "A", age: 30, sex: "Male" }] };
    }
    if (table === "patient_accounts") {
      return { data: over.account ?? { id: "acc1", patient_id: "p1", version: 0 } };
    }
    if (table === "visits") return { data: over.visits ?? [recentVisit()] };
    return { data: null };
  };
}

beforeEach(() => {
  setStub(singlePatient());
});

describe("tryLogin", () => {
  it("signs in with a valid access code", async () => {
    const result = await tryLogin({ phone: "9999999999", code: CODE });
    expect(result.kind).toBe("success");
  });

  it("rejects a wrong access code", async () => {
    const result = await tryLogin({ phone: "9999999999", code: "ZZZZZZ" });
    expect(result.kind).toBe("invalid_code");
  });

  // The counter was read, incremented and written back, so guesses issued in
  // parallel all read the same value and the 5-attempt lockout never engaged
  // against the attacker it exists to stop.
  it("counts a failed attempt with a single atomic call", async () => {
    await tryLogin({ phone: "9999999999", code: "ZZZZZZ" });

    expect(stub.rpcCalls.map((c) => c.name)).toContain("record_failed_patient_login");
    // No read-modify-write on the counters.
    const wrote = stub.calls.some(
      (c) => c.table === "patient_accounts" && (c.method === "update" || c.method === "insert"),
    );
    expect(wrote).toBe(false);
  });

  it("clears the counters atomically on success", async () => {
    await tryLogin({ phone: "9999999999", code: CODE });

    expect(stub.rpcCalls.map((c) => c.name)).toContain("record_successful_patient_login");
  });

  it("refuses to sign in while the account is locked", async () => {
    setStub(
      singlePatient({
        account: {
          id: "acc1",
          patient_id: "p1",
          version: 0,
          locked_until: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    );

    const result = await tryLogin({ phone: "9999999999", code: CODE });

    expect(result.kind).toBe("locked");
  });

  // A printed receipt is a bearer credential that the lab cannot take back. It
  // used to unlock the patient's whole record forever, with no expiry, so a
  // receipt found in a drawer years later still worked.
  describe("access code age", () => {
    const daysAgo = (n: number) =>
      new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

    it("accepts a code from a recent visit", async () => {
      setStub(singlePatient({ visits: [{ ...recentVisit(), visit_date: daysAgo(5) }] }));
      const result = await tryLogin({ phone: "9999999999", code: CODE });
      expect(result.kind).toBe("success");
    });

    it("rejects a code from a visit older than the validity window", async () => {
      setStub(
        singlePatient({
          visits: [{ ...recentVisit(), visit_date: daysAgo(ACCESS_CODE_VALID_DAYS + 1) }],
        }),
      );

      const result = await tryLogin({ phone: "9999999999", code: CODE });

      expect(result.kind).toBe("invalid_code");
    });

    it("still accepts the code when an older visit also carries one", async () => {
      setStub(
        singlePatient({
          visits: [
            { id: "old", access_code_hash: codeHash, visit_date: daysAgo(900) },
            { id: "new", access_code_hash: codeHash, visit_date: daysAgo(2) },
          ],
        }),
      );

      const result = await tryLogin({ phone: "9999999999", code: CODE });

      expect(result.kind).toBe("success");
    });
  });

  it("asks which patient when a phone is shared and none was chosen", async () => {
    setStub(({ table }) =>
      table === "patients"
        ? {
            data: [
              { id: "p1", name: "A", age: 30, sex: "Male" },
              { id: "p2", name: "B", age: 8, sex: "Female" },
            ],
          }
        : { data: null },
    );

    const result = await tryLogin({ phone: "9999999999", code: CODE });

    expect(result.kind).toBe("needs_chooser");
  });
});

describe("tryPasswordLogin", () => {
  function withPassword(patients: unknown[]): ResultSpec {
    return ({ table }) => {
      if (table === "patients") return { data: patients };
      if (table === "patient_accounts") {
        return { data: { id: "acc1", patient_id: "p1", version: 0, password_hash: passwordHash } };
      }
      return { data: null };
    };
  }

  it("signs in with the right password", async () => {
    setStub(withPassword([{ id: "p1", name: "A", age: 30, sex: "Male" }]));
    const result = await tryPasswordLogin("9999999999", "correct horse");
    expect(result.kind).toBe("success");
  });

  it("rejects the wrong password", async () => {
    setStub(withPassword([{ id: "p1", name: "A", age: 30, sex: "Male" }]));
    const result = await tryPasswordLogin("9999999999", "wrong");
    expect(result.kind).toBe("invalid_code");
  });

  // Households share one phone number (the unique constraint on patients.phone
  // was deliberately dropped for this). The chooser was returned but the function
  // accepted no patient id, so anyone sharing a phone could never use the
  // password path at all — it always came back asking which patient.
  describe("when the phone is shared", () => {
    const twoPatients = [
      { id: "p1", name: "A", age: 30, sex: "Male" },
      { id: "p2", name: "B", age: 8, sex: "Female" },
    ];

    it("asks which patient when none was chosen", async () => {
      setStub(withPassword(twoPatients));
      const result = await tryPasswordLogin("9999999999", "correct horse");
      expect(result.kind).toBe("needs_chooser");
    });

    it("signs in the chosen patient", async () => {
      setStub(withPassword(twoPatients));

      const result = await tryPasswordLogin("9999999999", "correct horse", "p1");

      expect(result.kind).toBe("success");
      if (result.kind === "success") expect(result.patientId).toBe("p1");
    });

    it("rejects a patient id that is not on this phone", async () => {
      setStub(withPassword(twoPatients));

      const result = await tryPasswordLogin("9999999999", "correct horse", "someone-else");

      expect(result.kind).toBe("invalid_code");
    });
  });
});

/**
 * A patient who books a home collection online never sets foot in the lab before
 * the phlebotomist arrives, so they hold no receipt — and the receipt is where
 * the access code is printed. There was no third way in, which meant the entire
 * online booking journey dead-ended at the login screen: the patient could not
 * see the visit they had just booked.
 *
 * The booking id is what they do have. It is on the confirmation page and in the
 * approval email. It is sequential and therefore guessable on its own, so it is
 * only ever accepted together with the phone number the booking was made on —
 * the same strength as phone + access code, which is the bar already set.
 */
describe("tryBookingIdLogin", () => {
  const BOOKING = "BKG-2026-00007";

  /** A converted booking whose patient has not yet chosen a password. */
  function bookingLogin(over: { booking?: unknown; account?: unknown } = {}): ResultSpec {
    return ({ table }) => {
      if (table === "bookings") {
        return {
          data:
            over.booking === undefined
              ? {
                  id: "b1",
                  booking_id: BOOKING,
                  patient_phone: "9999999999",
                  status: "Approved",
                  resulting_patient_id: "p1",
                }
              : over.booking,
        };
      }
      if (table === "patients") return { data: [{ id: "p1", name: "A", age: 30, sex: "Male" }] };
      if (table === "patient_accounts") {
        return { data: over.account ?? { id: "acc1", patient_id: "p1", version: 0 } };
      }
      return { data: null };
    };
  }

  it("signs the patient in with the booking id and the phone it was made on", async () => {
    setStub(bookingLogin());

    const result = await tryBookingIdLogin("9999999999", BOOKING);

    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.patientId).toBe("p1");
  });

  // Otherwise it is a credential that never expires, on a number that is printed
  // in an email and guessable by counting.
  it("tells the caller a password still has to be chosen", async () => {
    setStub(bookingLogin());

    const result = await tryBookingIdLogin("9999999999", BOOKING);

    expect(result.kind === "success" && result.mustSetPassword).toBe(true);
  });

  it("stops working once the patient has set a password", async () => {
    setStub(bookingLogin({ account: { id: "acc1", patient_id: "p1", password_hash: passwordHash } }));

    const result = await tryBookingIdLogin("9999999999", BOOKING);

    expect(result.kind).toBe("invalid_code");
  });

  // A booking id alone is a sequence anyone can count through.
  it("refuses a booking id presented with the wrong phone number", async () => {
    setStub(bookingLogin());

    const result = await tryBookingIdLogin("9111111111", BOOKING);

    expect(result.kind).toBe("invalid_code");
  });

  it("refuses a booking id that does not exist", async () => {
    setStub(bookingLogin({ booking: null }));

    const result = await tryBookingIdLogin("9999999999", "BKG-2026-99999");

    expect(result.kind).toBe("invalid_code");
  });

  // The booking is real but the desktop has not turned it into a patient yet.
  // Saying "wrong code" would send them hunting for a mistake they did not make.
  it("says the booking is not ready when no patient exists for it yet", async () => {
    setStub(
      bookingLogin({
        booking: {
          id: "b1",
          booking_id: BOOKING,
          patient_phone: "9999999999",
          status: "Approved",
          resulting_patient_id: null,
        },
      }),
    );

    const result = await tryBookingIdLogin("9999999999", BOOKING);

    expect(result.kind).toBe("booking_not_ready");
  });

  it("refuses a booking that was declined", async () => {
    setStub(
      bookingLogin({
        booking: {
          id: "b1",
          booking_id: BOOKING,
          patient_phone: "9999999999",
          status: "Declined",
          resulting_patient_id: null,
        },
      }),
    );

    expect((await tryBookingIdLogin("9999999999", BOOKING)).kind).toBe("invalid_code");
  });

  it("is not case- or space-sensitive about the booking id", async () => {
    setStub(bookingLogin());

    const result = await tryBookingIdLogin("9999999999", "  bkg-2026-00007 ");

    expect(result.kind).toBe("success");
  });
});

/**
 * The way in for a walk-in patient.
 *
 * The lab does not print receipts — that is a cost it will not carry — so the
 * access code reaches the patient only on the finished report, which is printed
 * at the very end. Until then they had no way in at all: they could not watch
 * their report's progress, and they could not pay to release it, which is the
 * whole point of the portal for them.
 *
 * The patient id is the one credential staff can hand over at the counter,
 * out loud, at registration. It is `LAB-YYYY-NNNNN` and therefore guessable by
 * counting, so it carries the same limits as the booking id: never accepted
 * without the phone it belongs to, and spent the moment a password exists.
 */
describe("tryPatientIdLogin", () => {
  const PATIENT_ID = "LAB-2026-00042";

  function patientIdLogin(over: { patient?: unknown; account?: unknown } = {}): ResultSpec {
    return ({ table }) => {
      if (table === "patients") {
        return {
          data:
            over.patient === undefined
              ? { id: "p1", patient_id: PATIENT_ID, phone: "9999999999" }
              : over.patient,
        };
      }
      if (table === "patient_accounts") {
        return { data: over.account ?? { id: "acc1", patient_id: "p1", version: 0 } };
      }
      return { data: null };
    };
  }

  it("signs the patient in with their patient id and phone number", async () => {
    setStub(patientIdLogin());

    const result = await tryPatientIdLogin("9999999999", PATIENT_ID);

    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.patientId).toBe("p1");
  });

  it("requires a password to be chosen straight away", async () => {
    setStub(patientIdLogin());

    const result = await tryPatientIdLogin("9999999999", PATIENT_ID);

    expect(result.kind === "success" && result.mustSetPassword).toBe(true);
  });

  it("stops working once the patient has set a password", async () => {
    setStub(
      patientIdLogin({ account: { id: "acc1", patient_id: "p1", password_hash: passwordHash } }),
    );

    expect((await tryPatientIdLogin("9999999999", PATIENT_ID)).kind).toBe("invalid_code");
  });

  // The id is a sequence anyone can count through, so on its own it is nothing.
  it("refuses a patient id presented with the wrong phone number", async () => {
    setStub(patientIdLogin());

    expect((await tryPatientIdLogin("9111111111", PATIENT_ID)).kind).toBe("invalid_code");
  });

  it("refuses a patient id that does not exist", async () => {
    setStub(patientIdLogin({ patient: null }));

    expect((await tryPatientIdLogin("9999999999", "LAB-2026-99999")).kind).toBe("invalid_code");
  });

  it("refuses a patient whose record has been removed", async () => {
    setStub(
      patientIdLogin({
        patient: { id: "p1", patient_id: PATIENT_ID, phone: "9999999999", deleted_at: "2026-01-01" },
      }),
    );

    expect((await tryPatientIdLogin("9999999999", PATIENT_ID)).kind).toBe("invalid_code");
  });

  it("is not case- or space-sensitive about the patient id", async () => {
    setStub(patientIdLogin());

    expect((await tryPatientIdLogin("9999999999", "  lab-2026-00042 ")).kind).toBe("success");
  });

  it("refuses to sign in while the account is locked", async () => {
    setStub(
      patientIdLogin({
        account: {
          id: "acc1",
          patient_id: "p1",
          locked_until: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    );

    expect((await tryPatientIdLogin("9999999999", PATIENT_ID)).kind).toBe("locked");
  });
});
