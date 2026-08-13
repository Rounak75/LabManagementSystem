// The point of a CSP is the things it refuses. These tests are written against
// the refusals rather than the exact header string, so reordering directives or
// adding a new one does not fail them, but weakening one does.

import { describe, it, expect } from "vitest";
import { buildCsp, generateNonce } from "../security-headers";

/** Pulls one directive out of the policy for inspection. */
function directive(csp: string, name: string): string {
  const found = csp.split("; ").find((d) => d.startsWith(`${name} `));
  if (!found) throw new Error(`no '${name}' directive in: ${csp}`);
  return found;
}

describe("buildCsp", () => {
  it("carries the nonce it was given", () => {
    expect(directive(buildCsp("abc123"), "script-src")).toContain("'nonce-abc123'");
  });

  // The whole reason for the nonce machinery. With 'unsafe-inline' present the
  // browser runs any inline script, including an injected one, and script-src
  // stops meaning anything at all.
  it("never allows arbitrary inline scripts", () => {
    expect(directive(buildCsp("n"), "script-src")).not.toContain("'unsafe-inline'");
  });

  // React writes style="..." attributes a nonce cannot cover. Allowed knowingly
  // — see the comment in security-headers.ts — so this pins the asymmetry as a
  // decision rather than letting it look like an oversight.
  it("allows inline styles, but only styles", () => {
    const csp = buildCsp("n");

    expect(directive(csp, "style-src")).toContain("'unsafe-inline'");
    expect(directive(csp, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("refuses eval in production and permits it in development", () => {
    expect(directive(buildCsp("n"), "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(buildCsp("n", { dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  // A framed portal with an invisible overlay is how a patient gets tricked into
  // clicking something they cannot see.
  it("forbids being framed by anyone", () => {
    expect(buildCsp("n")).toContain("frame-ancestors 'none'");
  });

  // An injected form posting a patient's password to another host is the attack
  // this closes, and it is not covered by script-src.
  it("confines form submissions to this origin", () => {
    expect(buildCsp("n")).toContain("form-action 'self'");
  });

  // Every Supabase call in this app is server-side, so the browser has no reason
  // to reach any other host. If a browser-side call is ever added this test is
  // the thing that should be argued with first.
  it("lets the browser talk only to this origin", () => {
    expect(directive(buildCsp("n"), "connect-src")).toBe("connect-src 'self'");
  });
});

describe("generateNonce", () => {
  // A nonce reused across requests is a nonce an attacker can read off one page
  // and paste into an injection aimed at the next.
  it("gives a different value every time", () => {
    const nonces = new Set(Array.from({ length: 50 }, generateNonce));

    expect(nonces.size).toBe(50);
  });
});
