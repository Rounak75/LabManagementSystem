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

  // The patient portal signs its session tokens with the same
  // SUPABASE_JWT_SECRET. verifyJWT checked the signature and nothing else, so a
  // patient's own cookie — which they can obtain simply by logging in — passed
  // verification here and produced a SessionUser with undefined id and role.
  // Every `if (!user) return 401` gate accepted it. Today RLS happens to contain
  // the damage because a patient token's `role` claim is "anon"; that containment
  // is accidental and disappears the moment an admin route uses a service-role
  // client. The staff token's own claims are what should be checked.
  describe("tokens minted for a different audience", () => {
    async function sign(claims: Record<string, unknown>) {
      const { SignJWT } = await import("jose");
      return new SignJWT(claims)
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode(SECRET));
    }

    it("rejects a patient portal token", async () => {
      // Exactly what mintPatientJwt produces.
      const token = await sign({ patient_id: "p1", role: "anon", sub: "p1", iss: "supabase" });
      await expect(verifyJWT(token, SECRET)).rejects.toThrow();
    });

    it("rejects a token with no user_id", async () => {
      const token = await sign({ role_app: "Admin" });
      await expect(verifyJWT(token, SECRET)).rejects.toThrow();
    });

    it("rejects a token with no role_app", async () => {
      const token = await sign({ user_id: "u1" });
      await expect(verifyJWT(token, SECRET)).rejects.toThrow();
    });

    it("rejects a token whose role_app is not a real role", async () => {
      const token = await sign({ user_id: "u1", role_app: "Superuser" });
      await expect(verifyJWT(token, SECRET)).rejects.toThrow();
    });

    it("accepts a Staff token", async () => {
      const token = await sign({ user_id: "u2", role_app: "Staff", username: "asha" });
      await expect(verifyJWT(token, SECRET)).resolves.toMatchObject({ role_app: "Staff" });
    });
  });

  it("encode/decode session payload roundtrip", () => {
    const original = { token: "abc.def.ghi", expiresAt: Date.now() + 1000 };
    const enc = encodeSessionPayload(original);
    const dec = decodeSessionPayload(enc);
    expect(dec).toEqual(original);
  });
});
