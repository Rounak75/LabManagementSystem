import { describe, it, expect, vi } from "vitest";

// Mock electron safeStorage. v2 stores `safeStorage.encryptString(plain)` directly,
// so the mock just needs encryptString/decryptString to round-trip.
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.concat([Buffer.from("enc:"), Buffer.from(s)]),
    decryptString: (b: Buffer) => b.toString("utf8").replace(/^enc:/, ""),
  },
  app: { getPath: () => "/tmp" },
}));

import { encryptSecret, decryptSecret, SecretUnreadableError } from "../crypto.service";

describe("crypto.service", () => {
  it("round-trips a string", () => {
    const cipher = encryptSecret("hello-world");
    expect(cipher.startsWith("v2:")).toBe(true);
    expect(cipher).not.toBe("hello-world");
    expect(decryptSecret(cipher)).toBe("hello-world");
  });

  it("round-trips an empty string", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
  });

  it("throws SecretUnreadableError on legacy v1 blobs", () => {
    expect(() => decryptSecret("v1:anything")).toThrow(SecretUnreadableError);
  });

  it("throws on unknown cipher version", () => {
    expect(() => decryptSecret("v9:garbage")).toThrow(/Unknown cipher version/);
  });
});
