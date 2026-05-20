import { describe, it, expect } from "vitest";
import {
  generatePlaintextCode,
  hashCode,
  verifyCode,
  generateAndHash,
  ACCESS_CODE_CHARSET,
  ACCESS_CODE_LENGTH
} from "../access-code.service";

describe("access-code.service", () => {
  it("generates a 6-character code from the safe charset", () => {
    for (let i = 0; i < 100; i++) {
      const code = generatePlaintextCode();
      expect(code).toHaveLength(ACCESS_CODE_LENGTH);
      expect(code).toMatch(new RegExp(`^[${ACCESS_CODE_CHARSET}]{${ACCESS_CODE_LENGTH}}$`));
    }
  });

  it("charset excludes confusable characters 0, O, 1, I", () => {
    expect(ACCESS_CODE_CHARSET).not.toContain("0");
    expect(ACCESS_CODE_CHARSET).not.toContain("O");
    expect(ACCESS_CODE_CHARSET).not.toContain("1");
    expect(ACCESS_CODE_CHARSET).not.toContain("I");
  });

  it("hashes round-trip via verifyCode", async () => {
    const plain = generatePlaintextCode();
    const hash = await hashCode(plain);
    expect(hash).not.toBe(plain);
    await expect(verifyCode(plain, hash)).resolves.toBe(true);
    await expect(verifyCode("WRONG1", hash)).resolves.toBe(false);
  });

  it("verifyCode is case-insensitive on the input", async () => {
    const hash = await hashCode("K7P2QX");
    await expect(verifyCode("k7p2qx", hash)).resolves.toBe(true);
    await expect(verifyCode("K7P2QX", hash)).resolves.toBe(true);
  });

  it("generateAndHash returns matching plaintext/hash pair", async () => {
    const { plaintext, hash } = await generateAndHash();
    expect(plaintext).toMatch(new RegExp(`^[${ACCESS_CODE_CHARSET}]{${ACCESS_CODE_LENGTH}}$`));
    await expect(verifyCode(plaintext, hash)).resolves.toBe(true);
  });

  it("two consecutive generates produce different codes (entropy sanity)", () => {
    expect(generatePlaintextCode()).not.toBe(generatePlaintextCode());
  });
});
