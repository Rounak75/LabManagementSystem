// Per-account lockout stops someone guessing at one patient. These cover the
// other shape: one guess against each of thousands of phone numbers, which
// never trips any single account's counter.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

import { issuePuzzle } from "@portal/lib/captcha";
import { CAPTCHA_AFTER_FAILURES } from "@portal/lib/login-throttle";
import { POST } from "../route";

beforeAll(() => { process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa"; });
beforeEach(() => { stub = makeSupabaseStub(); });

/** Stub with a fixed recent-failure count for the origin and no matching patient. */
function withRecentFailures(count: number) {
  const spec: ResultSpec = ({ table }) => {
    if (table.startsWith("rpc:")) return { data: count };
    return { data: [] }; // no patient on this phone
  };
  stub = makeSupabaseStub(spec);
}

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", ...headers }),
    body: JSON.stringify(body),
  });
}

const FROM_ONE_ADDRESS = { "x-real-ip": "203.0.113.9" };

describe("POST /api/auth/login — origin throttling", () => {
  it("does not challenge an origin that has not been failing", async () => {
    withRecentFailures(0);

    const res = await POST(req({ phone: "9876543210", code: "ABC123" }, FROM_ONE_ADDRESS));

    // Reached the credential check rather than being stopped at the gate.
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("no_patient_found");
  });

  it("demands a puzzle once the origin has failed repeatedly", async () => {
    withRecentFailures(CAPTCHA_AFTER_FAILURES);

    const res = await POST(req({ phone: "9876543210", code: "ABC123" }, FROM_ONE_ADDRESS));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("captcha_required");
    expect(body.captchaRequired).toBe(true);
  });

  it("rejects a wrong answer to the puzzle", async () => {
    withRecentFailures(CAPTCHA_AFTER_FAILURES);
    const puzzle = await issuePuzzle();

    const res = await POST(
      req(
        { phone: "9876543210", code: "ABC123", captchaToken: puzzle.token, captchaAnswer: 9999 },
        FROM_ONE_ADDRESS,
      ),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("captcha_required");
  });

  it("lets a solved puzzle through to the credential check", async () => {
    withRecentFailures(CAPTCHA_AFTER_FAILURES);
    const puzzle = await issuePuzzle();
    const answer = Number(/What is (\d+) \+ (\d+)\?/.exec(puzzle.question)!.slice(1, 3)
      .reduce((a, b) => Number(a) + Number(b), 0));

    const res = await POST(
      req(
        { phone: "9876543210", code: "ABC123", captchaToken: puzzle.token, captchaAnswer: answer },
        FROM_ONE_ADDRESS,
      ),
    );

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("no_patient_found");
  });

  it("counts a failed login against the origin", async () => {
    withRecentFailures(0);

    await POST(req({ phone: "9876543210", code: "ABC123" }, FROM_ONE_ADDRESS));

    expect(stub.rpcCalls.map((c) => c.name)).toContain("record_failed_login_origin");
  });

  // A NAT'd clinic or a platform that strips the header must not become an
  // unauthenticated bypass, nor a hard failure.
  it("still checks credentials when no address is available", async () => {
    withRecentFailures(0);

    const res = await POST(req({ phone: "9876543210", code: "ABC123" }));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("no_patient_found");
  });
});
