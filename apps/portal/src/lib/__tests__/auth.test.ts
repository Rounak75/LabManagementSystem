import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

import { tryLogin, tryPasswordLogin, ACCESS_CODE_VALID_DAYS } from "../auth";

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
