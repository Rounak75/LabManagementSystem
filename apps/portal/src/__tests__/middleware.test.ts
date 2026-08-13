// The middleware is the only place that sees every request, so it is the only
// place that can hold a half-finished session to the one screen it is allowed to
// reach.
//
// Signing in with a booking id or a patient id used to hand back an ordinary
// 30-day session and merely *redirect* to the password page. Nothing enforced
// it: typing /dashboard walked straight past, and the id — guessable by counting
// and with no expiry — stayed a working credential for as long as the patient
// never got round to choosing a password.

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { mintPatientJwt } from "@portal/lib/jwt";
import { middleware } from "../middleware";

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa";
});

function get(path: string, token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set("cookie", `portal_session=${token}`);
  return new NextRequest(`http://localhost${path}`, { headers });
}

/** Where this response sends the browser, or null when it lets the request through. */
function redirectedTo(res: Response): string | null {
  const location = res.headers.get("location");
  return location ? new URL(location).pathname + new URL(location).search : null;
}

describe("portal middleware", () => {
  it("sends a request with no session to the login page", async () => {
    const res = await middleware(get("/dashboard"));

    expect(redirectedTo(res)).toBe("/login?next=%2Fdashboard");
  });

  it("lets a public page through untouched", async () => {
    const res = await middleware(get("/book"));

    expect(redirectedTo(res)).toBeNull();
  });

  it("lets an ordinary session reach the dashboard", async () => {
    const token = await mintPatientJwt("p1");

    const res = await middleware(get("/dashboard", token));

    expect(redirectedTo(res)).toBeNull();
  });

  describe("a session opened with a first-time id", () => {
    it("is held at the password page wherever it tries to go", async () => {
      const token = await mintPatientJwt("p1", { mustSetPassword: true });

      const res = await middleware(get("/dashboard", token));

      expect(redirectedTo(res)).toBe("/account/password?first=1");
    });

    it("is held even on a deep link to someone's visit", async () => {
      const token = await mintPatientJwt("p1", { mustSetPassword: true });

      const res = await middleware(get("/visits/v1", token));

      expect(redirectedTo(res)).toBe("/account/password?first=1");
    });

    // Or the redirect would point at itself forever and the patient could never
    // reach the one screen that ends the state.
    it("reaches the password page itself", async () => {
      const token = await mintPatientJwt("p1", { mustSetPassword: true });

      const res = await middleware(get("/account/password?first=1", token));

      expect(redirectedTo(res)).toBeNull();
    });
  });

  // A cookie that does not verify is not a session. Treating it as one was safe
  // only because every page called requirePatient() as well; leaving it that way
  // would mean a forged cookie could carry a patient past this check.
  it("sends a request with an unreadable session to the login page", async () => {
    const res = await middleware(get("/dashboard", "garbage.token.value"));

    expect(redirectedTo(res)).toBe("/login?next=%2Fdashboard");
  });

  describe("content security policy", () => {
    // The middleware is the only thing that can mint a per-request nonce, so a
    // page it did not touch is a page with no CSP on it.
    it("is set on a public page", async () => {
      const res = await middleware(get("/book"));

      expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    });

    // /login takes a phone number and a password from someone not signed in.
    // Protecting only the authed pages would leave exactly the wrong one bare.
    it("is set on the login page", async () => {
      const res = await middleware(get("/login"));

      expect(res.headers.get("content-security-policy")).toContain("script-src");
    });

    it("is set on an authed page", async () => {
      const token = await mintPatientJwt("p1");

      const res = await middleware(get("/dashboard", token));

      expect(res.headers.get("content-security-policy")).toContain("script-src");
    });

    // A redirect still renders in the browser, and the response that carries a
    // patient to /login should not be the one gap in the policy.
    it("survives the redirect to login", async () => {
      const res = await middleware(get("/dashboard"));

      expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    });

    it("uses a fresh nonce per request", async () => {
      const first = await middleware(get("/book"));
      const second = await middleware(get("/book"));

      expect(first.headers.get("content-security-policy")).not.toBe(
        second.headers.get("content-security-policy"),
      );
    });
  });
});
