import { describe, it, expect, beforeAll } from "vitest";
import { mintPatientJwt, verifyPatientJwt } from "../jwt";

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa";
});

describe("patient JWT", () => {
  it("mints a token that verifies back to the same patient_id", async () => {
    const token = await mintPatientJwt("patient-123");
    const payload = await verifyPatientJwt(token);
    expect(payload.patient_id).toBe("patient-123");
    expect(payload.iss).toBe("supabase");
    expect(payload.sub).toBe("patient-123");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await mintPatientJwt("patient-123");
    process.env.SUPABASE_JWT_SECRET = "a-totally-different-secret-32-chars-xx";
    await expect(verifyPatientJwt(token)).rejects.toBeTruthy();
    process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa";
  });

  it("rejects a garbage token", async () => {
    await expect(verifyPatientJwt("not.a.jwt")).rejects.toBeTruthy();
  });

  // A session opened with a booking id or a patient id is not a full session:
  // that credential is guessable by counting and never expires, so the patient
  // has to trade it for a password before doing anything else. The requirement
  // travels in the token because the middleware is the only thing that sees
  // every request, and it has nothing else to go on.
  describe("first-time sessions", () => {
    it("carries the must-set-password requirement when asked to", async () => {
      const token = await mintPatientJwt("patient-123", { mustSetPassword: true });

      const payload = await verifyPatientJwt(token);

      expect(payload.must_set_password).toBe(true);
    });

    it("carries no such requirement by default", async () => {
      const token = await mintPatientJwt("patient-123");

      const payload = await verifyPatientJwt(token);

      expect(payload.must_set_password).toBeUndefined();
    });
  });
});
