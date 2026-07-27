import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeSupabaseStub } from "@/test/supabase-stub";

let sessionUser: { id: string; token: string } | null = { id: "staff-1", token: "tok" };
vi.mock("@/lib/auth-session", () => ({ getSessionUser: () => sessionUser }));

let stub = makeSupabaseStub({ data: null, error: null });
vi.mock("@/lib/supabase-client", () => ({ getServerSupabase: () => stub.client }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "../route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/queue/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Offline-queued payloads carry no base_version — see ParameterCard.
const queuedBody = {
  visit_test_id: "vt1",
  parameter_id: "param1",
  value: "5.2",
  is_abnormal: false,
};

beforeEach(() => {
  sessionUser = { id: "staff-1", token: "tok" };
});

describe("POST /api/queue/sync", () => {
  it("401 when not authenticated", async () => {
    sessionUser = null;
    stub = makeSupabaseStub({ data: null, error: null });
    expect((await POST(req(queuedBody))).status).toBe(401);
  });

  it("applies the queued write and reports the server-assigned version", async () => {
    stub = makeSupabaseStub(({ table, methods }) => {
      if (table === "visit_tests") return { data: { is_locked: false }, error: null };
      if (table === "results" && methods.includes("select") && !methods.includes("insert")) {
        return { data: { id: "r1", version: 2 }, error: null };
      }
      return { data: { id: "r1" }, error: null };
    });

    const res = await POST(req(queuedBody));

    expect(res.status).toBe(200);
    // Must be a flat {id, version} — not a nested object.
    expect(await res.json()).toEqual({ id: "r1", version: 3 });
  });

  it("409 when the test was verified and locked while the edit sat in the queue", async () => {
    stub = makeSupabaseStub(({ table }) =>
      table === "visit_tests"
        ? { data: { is_locked: true }, error: null }
        : { data: null, error: null },
    );

    const res = await POST(req(queuedBody));

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("result_locked");
    expect(stub.calls.some((c) => c.table === "results")).toBe(false);
  });
});
