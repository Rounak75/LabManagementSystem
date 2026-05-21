import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabaseStub } from "@portal/test/supabase-stub";

const stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

import { mintPatientJwt } from "@portal/lib/jwt";
import { POST } from "../route";

beforeAll(() => { process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa"; });
beforeEach(() => { stub.calls.length = 0; stub.client.from.mockClear(); });

function reqWithCookie(token?: string): NextRequest {
  const headers = new Headers();
  if (token) headers.set("cookie", `portal_session=${token}`);
  return new NextRequest("http://localhost/api/disputes", { method: "POST", headers });
}

describe("POST /api/disputes", () => {
  it("401 when not logged in", async () => {
    const res = await POST(reqWithCookie());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("not_logged_in");
  });
  it("401 on an invalid token", async () => {
    const res = await POST(reqWithCookie("garbage.token.value"));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
  });
  it("inserts a dispute for the authed patient and returns ok", async () => {
    const token = await mintPatientJwt("patient-9");
    const res = await POST(reqWithCookie(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const insert = stub.calls.find((c) => c.table === "disputes" && c.method === "insert");
    expect(insert).toBeTruthy();
    expect((insert!.arg as any).patient_id).toBe("patient-9");
  });
});
