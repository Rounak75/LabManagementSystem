import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub, type ResultSpec } from "@portal/test/supabase-stub";

// The endpoint is unauthenticated by design — an uptime monitor cannot hold a
// credential. The only thing it can reach is one row of a table containing a
// single timestamp, so the stub is the whole world it sees.
let stub = makeSupabaseStub();
vi.mock("@portal/lib/supabase-server", () => ({ getServiceClient: () => stub.client }));

import { GET } from "../route";

function setStub(spec: ResultSpec) { stub = makeSupabaseStub(spec); }
beforeEach(() => { stub = makeSupabaseStub(); });

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

describe("GET /api/health", () => {
  it("returns 200 and reports the database as reachable", async () => {
    setStub({ data: { last_pushed_at: minutesAgo(1) } });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("reachable");
  });

  it("actually queries Postgres — a check that never touches the database would not keep a free project awake", async () => {
    setStub({ data: { last_pushed_at: minutesAgo(1) } });
    await GET();
    expect(stub.calls.some((c) => c.table === "cloud_heartbeat")).toBe(true);
    expect(stub.calls.some((c) => c.method === "select")).toBe(true);
  });

  it("returns 503 when the database errors", async () => {
    setStub({ data: null, error: { message: "connection refused" } });
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.database).toBe("unreachable");
  });

  it("does not leak the database error text to an unauthenticated caller", async () => {
    setStub({ data: null, error: { message: "FATAL: password authentication failed for user 'postgres'" } });
    const res = await GET();
    expect(JSON.stringify(await res.json())).not.toMatch(/password|postgres|FATAL/i);
  });

  it("reports sync staleness without failing the check — a stale desktop is not an unhealthy portal", async () => {
    setStub({ data: { last_pushed_at: minutesAgo(240) } });
    const res = await GET();
    // Still 200: availability and freshness are separate signals, and paging the
    // owner about an offline home PC every time the portal is fine is the way to
    // train someone to ignore the alert.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.syncFresh).toBe(false);
    expect(body.syncAgeMinutes).toBeGreaterThanOrEqual(239);
  });

  it("counts a recent heartbeat as fresh", async () => {
    setStub({ data: { last_pushed_at: minutesAgo(5) } });
    const body = await (await GET()).json();
    expect(body.syncFresh).toBe(true);
  });

  it("survives a heartbeat row that does not exist yet", async () => {
    // A cloud provisioned but never yet pushed to by the desktop. The portal is
    // up; there is simply nothing to report about freshness.
    setStub({ data: null, error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.database).toBe("reachable");
    expect(body.syncFresh).toBe(null);
    expect(body.syncAgeMinutes).toBe(null);
  });

  it("treats an unparseable heartbeat timestamp as unknown rather than fresh", async () => {
    setStub({ data: { last_pushed_at: "not-a-date" } });
    const body = await (await GET()).json();
    expect(body.syncFresh).toBe(null);
    expect(body.syncAgeMinutes).toBe(null);
  });
});
