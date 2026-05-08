import { describe, it, expect } from "vitest";
import { generateRecoveryCode, formatForDisplay, hashRecoveryCode, verifyRecoveryCode } from "../recovery-code";

describe("recovery-code", () => {
  it("generates a 16-character A-Z0-9 code", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z0-9]{16}$/);
  });

  it("generates unique codes across calls", () => {
    const a = generateRecoveryCode();
    const b = generateRecoveryCode();
    expect(a).not.toBe(b);
  });

  it("formats as four 4-char groups", () => {
    expect(formatForDisplay("XK7PN4QZA82MRDV6")).toBe("XK7P-N4QZ-A82M-RDV6");
  });

  it("hashes and verifies a code", async () => {
    const code = generateRecoveryCode();
    const hash = await hashRecoveryCode(code);
    expect(await verifyRecoveryCode(code, hash)).toBe(true);
    expect(await verifyRecoveryCode("WRONGCODE0000000", hash)).toBe(false);
  });
});
