import { describe, it, expect } from "vitest";
import { verifyJWT, encodeSessionPayload, decodeSessionPayload } from "./auth-session";

const SECRET = "test-secret-32-bytes-long-padding";

describe("auth-session", () => {
  it("verifyJWT accepts a valid token", async () => {
    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ user_id: "u1", role_app: "Admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(key);
    const payload = await verifyJWT(token, SECRET);
    expect(payload.user_id).toBe("u1");
    expect(payload.role_app).toBe("Admin");
  });

  it("verifyJWT rejects an expired token", async () => {
    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ user_id: "u1" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    await expect(verifyJWT(token, SECRET)).rejects.toThrow();
  });

  it("encode/decode session payload roundtrip", () => {
    const original = { token: "abc.def.ghi", expiresAt: Date.now() + 1000 };
    const enc = encodeSessionPayload(original);
    const dec = decodeSessionPayload(enc);
    expect(dec).toEqual(original);
  });
});
