import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

// Mock only Supabase; trySetPassword (in @portal/lib/auth) and bcrypt run for real.
let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

import { mintPatientJwt } from "@portal/lib/jwt";
import { POST } from "../route";

beforeAll(() => { process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa"; });
beforeEach(() => { stub = makeSupabaseStub(); });
function setStub(spec: ResultSpec) { stub = makeSupabaseStub(spec); }

function req(body: unknown, token?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("cookie", `portal_session=${token}`);
  return new NextRequest("http://localhost/api/auth/set-password", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/set-password", () => {
  it("401 when not logged in", async () => {
    const res = await POST(req({ password: "longenough123" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("not_logged_in");
  });

  it("401 on an invalid token", async () => {
    const res = await POST(req({ password: "longenough123" }, "garbage.token.value"));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });

  it("400 when the password is too short", async () => {
    // An account exists, but the <8 char guard fires before any write.
    setStub({ data: { id: "acct-1", version: 1 } });
    const token = await mintPatientJwt("patient-1");
    const res = await POST(req({ password: "short" }, token));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("password_too_short");
    expect(stub.calls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("hashes and stores the new password for the authed patient", async () => {
    setStub({ data: { id: "acct-1", version: 1 } });
    const token = await mintPatientJwt("patient-1");
    const plaintext = "correcthorsebattery";
    const res = await POST(req({ password: plaintext }, token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const update = stub.calls.find((c) => c.table === "patient_accounts" && c.method === "update");
    expect(update).toBeTruthy();
    const arg = update!.arg as any;
    expect(typeof arg.password_hash).toBe("string");
    expect(arg.password_hash.length).toBeGreaterThan(0);
    expect(arg.password_hash).not.toBe(plaintext); // hashed, not stored in the clear
    expect(arg.version).toBe(2); // account.version + 1
  });
});
