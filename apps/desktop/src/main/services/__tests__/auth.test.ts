import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../auth.service";

describe("auth.service hashing", () => {
  it("hashes a password and verifies the same plaintext", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).not.toBe("hunter2");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("hunter2", hash)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("battery staple", hash)).toBe(false);
  });
});
