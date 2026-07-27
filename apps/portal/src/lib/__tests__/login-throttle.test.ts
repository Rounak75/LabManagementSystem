import { describe, it, expect } from "vitest";
import {
  CAPTCHA_AFTER_FAILURES,
  captchaRequired,
  clientIpKey,
  hashIp,
} from "../login-throttle";

const SECRET = "test-secret";

describe("captchaRequired", () => {
  it("does not challenge a first-time visitor", () => {
    expect(captchaRequired(0)).toBe(false);
  });

  // A patient who fat-fingers their access code once should not meet a puzzle.
  it("does not challenge a single mistake", () => {
    expect(captchaRequired(1)).toBe(false);
  });

  it("challenges once the failure threshold is reached", () => {
    expect(captchaRequired(CAPTCHA_AFTER_FAILURES)).toBe(true);
  });

  it("keeps challenging beyond the threshold", () => {
    expect(captchaRequired(CAPTCHA_AFTER_FAILURES + 50)).toBe(true);
  });
});

describe("hashIp", () => {
  // Per-account lockout already stops guessing at one patient. This exists to
  // price up spraying one guess across thousands of phone numbers, which needs
  // the address on record — but the address itself is identifying, so only a
  // keyed digest is stored.
  it("does not keep the address it was given", () => {
    expect(hashIp("203.0.113.9", SECRET)).not.toContain("203.0.113.9");
  });

  it("gives the same address the same key", () => {
    expect(hashIp("203.0.113.9", SECRET)).toBe(hashIp("203.0.113.9", SECRET));
  });

  it("gives different addresses different keys", () => {
    expect(hashIp("203.0.113.9", SECRET)).not.toBe(hashIp("203.0.113.10", SECRET));
  });

  // Without the secret in the mix, a leaked table is trivially reversible:
  // the whole IPv4 space is only four billion hashes.
  it("gives a different key under a different secret", () => {
    expect(hashIp("203.0.113.9", SECRET)).not.toBe(hashIp("203.0.113.9", "other-secret"));
  });
});

describe("clientIpKey", () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  it("prefers the platform's own client address header", () => {
    const key = clientIpKey(headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" }), SECRET);
    expect(key).toBe(hashIp("203.0.113.9", SECRET));
  });

  // x-forwarded-for is a chain: the client is the first entry, and everything
  // after it is a proxy that appended itself.
  it("takes the client from the front of a forwarded chain", () => {
    const key = clientIpKey(headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.1, 10.0.0.1" }), SECRET);
    expect(key).toBe(hashIp("203.0.113.9", SECRET));
  });

  it("handles a forwarded chain with one entry", () => {
    const key = clientIpKey(headers({ "x-forwarded-for": "203.0.113.9" }), SECRET);
    expect(key).toBe(hashIp("203.0.113.9", SECRET));
  });

  it("returns null when no address is present", () => {
    expect(clientIpKey(headers({}), SECRET)).toBeNull();
  });

  it("returns null rather than a key for an empty header", () => {
    expect(clientIpKey(headers({ "x-forwarded-for": "   " }), SECRET)).toBeNull();
  });
});
