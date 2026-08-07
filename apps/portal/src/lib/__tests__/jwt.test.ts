import { describe, it, expect, beforeAll } from "vitest";
import {
  mintPatientJwt,
  verifyPatientJwt,
  SESSION_TTL_SECS,
  SETUP_TTL_SECS,
} from "../jwt";
import { setSessionCookie } from "../session-cookie";

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

  // Expiry is the whole of the revocation policy here: logging out clears the
  // cookie but not the token, and changing a password does not invalidate one
  // already minted. So the two lifetimes are asserted rather than left to
  // whichever constant a later edit happens to reach for.
  describe("lifetimes", () => {
    it("gives a full session seven days", async () => {
      const token = await mintPatientJwt("patient-123");

      const { iat, exp } = await verifyPatientJwt(token);

      expect(exp - iat).toBe(SESSION_TTL_SECS);
      expect(SESSION_TTL_SECS).toBe(7 * 24 * 60 * 60);
    });

    it("gives a half-session only long enough to choose a password", async () => {
      const token = await mintPatientJwt("patient-123", { mustSetPassword: true });

      const { iat, exp } = await verifyPatientJwt(token);

      expect(exp - iat).toBe(SETUP_TTL_SECS);
      expect(SETUP_TTL_SECS).toBe(30 * 60);
    });

    // The point of the split. A booking id is guessable by counting, so the
    // session it opens must not stand open as long as one bought with a
    // password.
    it("expires a half-session far sooner than a full one", async () => {
      const full = await verifyPatientJwt(await mintPatientJwt("p1"));
      const setup = await verifyPatientJwt(
        await mintPatientJwt("p1", { mustSetPassword: true }),
      );

      expect(setup.exp).toBeLessThan(full.exp);
    });
  });
});

// The cookie is told to live exactly as long as the token it carries. A second
// hand-written lifetime is what left one route issuing a 30-day cookie around
// a token that had stopped being valid weeks earlier.
describe("session cookie", () => {
  function captureCookie() {
    const set: Record<string, unknown>[] = [];
    const res = { cookies: { set: (...args: unknown[]) => set.push(args[2] as Record<string, unknown>) } };
    return { res, set };
  }

  it("matches the cookie's max age to a full session's expiry", async () => {
    const token = await mintPatientJwt("patient-123");
    const { res, set } = captureCookie();

    setSessionCookie(res as never, token);

    expect(set[0]?.maxAge).toBeGreaterThan(SESSION_TTL_SECS - 5);
    expect(set[0]?.maxAge).toBeLessThanOrEqual(SESSION_TTL_SECS);
  });

  it("matches the cookie's max age to a half-session's expiry", async () => {
    const token = await mintPatientJwt("patient-123", { mustSetPassword: true });
    const { res, set } = captureCookie();

    setSessionCookie(res as never, token);

    expect(set[0]?.maxAge).toBeGreaterThan(SETUP_TTL_SECS - 5);
    expect(set[0]?.maxAge).toBeLessThanOrEqual(SETUP_TTL_SECS);
  });

  it("keeps the flags that stop the cookie being read or sent around", async () => {
    const token = await mintPatientJwt("patient-123");
    const { res, set } = captureCookie();

    setSessionCookie(res as never, token);

    expect(set[0]?.httpOnly).toBe(true);
    expect(set[0]?.sameSite).toBe("strict");
  });
});
