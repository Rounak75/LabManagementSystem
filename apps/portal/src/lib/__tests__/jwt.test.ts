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
});
