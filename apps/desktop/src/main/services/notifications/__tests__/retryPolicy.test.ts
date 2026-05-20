import { describe, it, expect } from "vitest";
import { nextDelayMs, MAX_RETRIES } from "../retry-policy";

describe("retry-policy", () => {
  it("MAX_RETRIES is 5", () => {
    expect(MAX_RETRIES).toBe(5);
  });

  it("returns the documented schedule for retries 1..5", () => {
    expect(nextDelayMs(1)).toBe(60_000);
    expect(nextDelayMs(2)).toBe(300_000);
    expect(nextDelayMs(3)).toBe(1_800_000);
    expect(nextDelayMs(4)).toBe(7_200_000);
    expect(nextDelayMs(5)).toBe(43_200_000);
  });

  it("returns null when retries are exhausted", () => {
    expect(nextDelayMs(6)).toBeNull();
    expect(nextDelayMs(99)).toBeNull();
  });
});
