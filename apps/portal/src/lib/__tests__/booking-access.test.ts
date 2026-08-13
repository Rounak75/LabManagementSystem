import { describe, it, expect, beforeAll } from "vitest";
import { mintBookingAccess, verifyBookingAccess } from "../booking-access";

beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa";
});

describe("booking access tokens", () => {
  it("unlocks the booking it was minted for", async () => {
    const token = await mintBookingAccess("BKG-2026-00042");

    expect(await verifyBookingAccess(token, "BKG-2026-00042")).toBe(true);
  });

  // The whole point. A token is minted per booking so that having one for your
  // own booking is not a key to the sequence it sits in — which is the attack
  // the phone check exists to stop, reintroduced one layer up.
  it("does not unlock a different booking", async () => {
    const token = await mintBookingAccess("BKG-2026-00042");

    expect(await verifyBookingAccess(token, "BKG-2026-00043")).toBe(false);
  });

  it("refuses a missing token", async () => {
    expect(await verifyBookingAccess(undefined, "BKG-2026-00042")).toBe(false);
    expect(await verifyBookingAccess("", "BKG-2026-00042")).toBe(false);
  });

  it("refuses a token that is not ours", async () => {
    expect(await verifyBookingAccess("not.a.token", "BKG-2026-00042")).toBe(false);
  });

  // The portal signs patient sessions with the same secret. A signature check
  // alone would let one be presented here as a booking key.
  it("refuses a validly-signed token of the wrong kind", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
    const wrongKind = await new SignJWT({ kind: "captcha", bid: "BKG-2026-00042" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
      .sign(secret);

    expect(await verifyBookingAccess(wrongKind, "BKG-2026-00042")).toBe(false);
  });

  it("refuses a token signed with someone else's secret", async () => {
    const { SignJWT } = await import("jose");
    const forged = await new SignJWT({ kind: "booking_access", bid: "BKG-2026-00042" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
      .sign(new TextEncoder().encode("a-totally-different-secret-32-chars-xx"));

    expect(await verifyBookingAccess(forged, "BKG-2026-00042")).toBe(false);
  });

  it("refuses a token that has expired", async () => {
    const { SignJWT } = await import("jose");
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
    const stale = await new SignJWT({ kind: "booking_access", bid: "BKG-2026-00042" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secret);

    expect(await verifyBookingAccess(stale, "BKG-2026-00042")).toBe(false);
  });
});
