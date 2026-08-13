import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";

const rpc = vi.fn();
vi.mock("../supabase-server", () => ({ getServiceClient: () => ({ rpc }) }));

import {
  checkRateLimit,
  enforceMemoryRateLimit,
  memoryRateLimit,
  resetMemoryRateLimits,
  LIMITS,
} from "../rate-limit";

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa";
});

beforeEach(() => {
  rpc.mockReset();
  resetMemoryRateLimits();
});

describe("checkRateLimit", () => {
  it("passes the bucket's window and ceiling to the database", async () => {
    rpc.mockResolvedValue({ data: { allowed: true, count: 1, retry_after_seconds: 1 } });

    await checkRateLimit("bookings", "ip-key");

    expect(rpc).toHaveBeenCalledWith("hit_rate_limit", {
      p_bucket: "bookings",
      p_ip_key: "ip-key",
      p_window_seconds: LIMITS.bookings.windowSeconds,
      p_max: LIMITS.bookings.max,
    });
  });

  it("refuses when the database says the budget is spent", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, count: 11, retry_after_seconds: 900 } });

    const decision = await checkRateLimit("bookings", "ip-key");

    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 900 });
  });

  // Fails open, and for these routes that costs almost nothing: if Supabase is
  // unreachable then the insert this limiter guards would fail anyway. The
  // alternative — refusing every booking whenever the counter is unavailable —
  // turns a bookkeeping outage into a closed booking form.
  it("allows the request through when the database is unreachable", async () => {
    rpc.mockRejectedValue(new Error("connection refused"));

    expect(await checkRateLimit("bookings", "ip-key")).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  // The RPC returns nothing at all until its migration has been applied. That
  // is a deploy-ordering state, not an attack, and it must not close the portal.
  it("allows the request through when the function is not migrated yet", async () => {
    rpc.mockResolvedValue({ data: null });

    expect((await checkRateLimit("bookings", "ip-key")).allowed).toBe(true);
  });
});

describe("memoryRateLimit", () => {
  const limit = { windowSeconds: 60, max: 3 };

  it("allows exactly the ceiling, then refuses", () => {
    const t = 1_000_000;

    const verdicts = [0, 1, 2, 3].map((i) => memoryRateLimit("b", "ip", limit, t + i).allowed);

    expect(verdicts).toEqual([true, true, true, false]);
  });

  it("counts each origin separately", () => {
    const t = 1_000_000;
    [0, 1, 2].forEach((i) => memoryRateLimit("b", "noisy", limit, t + i));

    expect(memoryRateLimit("b", "quiet", limit, t + 3).allowed).toBe(true);
  });

  // Otherwise one busy endpoint would spend another's budget.
  it("counts each bucket separately", () => {
    const t = 1_000_000;
    [0, 1, 2].forEach((i) => memoryRateLimit("captcha", "ip", limit, t + i));

    expect(memoryRateLimit("clientErrors", "ip", limit, t + 3).allowed).toBe(true);
  });

  it("forgets hits once they fall out of the window", () => {
    const t = 1_000_000;
    [0, 1, 2].forEach((i) => memoryRateLimit("b", "ip", limit, t + i));

    const afterWindow = memoryRateLimit("b", "ip", limit, t + 60_001);

    expect(afterWindow.allowed).toBe(true);
  });

  it("says how long to wait", () => {
    const t = 1_000_000;
    [0, 1, 2].forEach((i) => memoryRateLimit("b", "ip", limit, t + i));

    const refused = memoryRateLimit("b", "ip", limit, t + 10_000);

    expect(refused.retryAfterSeconds).toBe(50);
  });
});

describe("enforceMemoryRateLimit", () => {
  const headers = (ip: string) => new Headers({ "x-real-ip": ip });

  it("returns nothing while the caller is inside its budget", () => {
    expect(enforceMemoryRateLimit("captcha", headers("1.2.3.4"))).toBeNull();
  });

  it("returns a 429 with a Retry-After once the budget is spent", () => {
    const h = headers("1.2.3.4");
    for (let i = 0; i < 60; i++) enforceMemoryRateLimit("captcha", h);

    const res = enforceMemoryRateLimit("captcha", h);

    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  // An infrastructure change that stops forwarding the client address should
  // degrade the limiter, not take the site down.
  it("allows a request the platform gave no address for", () => {
    expect(enforceMemoryRateLimit("captcha", new Headers())).toBeNull();
  });
});
