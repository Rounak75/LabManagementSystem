import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock @supabase/supabase-js ────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // Leaf query builder: tracks chained calls and resolves with `result`
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    const result = { data: null as unknown, error: null as unknown };
    builder.result = result;

    // Each chainable method returns the same builder
    const chain = (fn: () => void = () => undefined) => {
      fn();
      return builder;
    };

    builder.select = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.upsert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.gt = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.single = vi.fn(() => builder);
    // Make builder thenable so `await builder` resolves
    builder.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve)
    );

    return builder;
  };

  const fromBuilder = makeBuilder();
  const rpcBuilder = makeBuilder();

  return {
    fromBuilder,
    rpcBuilder,
    createClient: vi.fn(() => ({
      from: vi.fn(() => fromBuilder),
      rpc: vi.fn(() => rpcBuilder),
    })),
    // Helpers so individual tests can override results
    setFromResult: (data: unknown, error: unknown = null) => {
      (fromBuilder.result as Record<string, unknown>).data = data;
      (fromBuilder.result as Record<string, unknown>).error = error;
    },
    setRpcResult: (data: unknown, error: unknown = null) => {
      (rpcBuilder.result as Record<string, unknown>).data = data;
      (rpcBuilder.result as Record<string, unknown>).error = error;
    },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { classifyError, createSupabaseClient } from "../supabase-client";

// ─── Test config ───────────────────────────────────────────────────────────────

const CONFIG = { url: "https://xyz.supabase.co", serviceKey: "svc-key", anonKey: "anon-key" };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no error
  mocks.setFromResult([], null);
  mocks.setRpcResult([], null);
});

// ─── classifyError ─────────────────────────────────────────────────────────────

describe("classifyError", () => {
  it("401 → non-retryable auth message", () => {
    const r = classifyError({ status: 401 });
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toMatch(/authentication failed/i);
  });

  it("403 → non-retryable auth message", () => {
    const r = classifyError({ status: 403 });
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toMatch(/authentication failed/i);
  });

  it("429 → retryable rate limited", () => {
    const r = classifyError({ status: 429 });
    expect(r.retryable).toBe(true);
    expect(r.userMessage).toMatch(/rate limited/i);
  });

  it("500 → retryable server error", () => {
    const r = classifyError({ status: 500 });
    expect(r.retryable).toBe(true);
    expect(r.userMessage).toMatch(/server error/i);
  });

  it("503 → retryable (also 5xx)", () => {
    const r = classifyError({ status: 503 });
    expect(r.retryable).toBe(true);
  });

  it("4xx with message → non-retryable, uses message", () => {
    const r = classifyError({ status: 400, message: "Table not found" });
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toBe("Table not found");
  });

  it("4xx without message → non-retryable fallback", () => {
    const r = classifyError({ status: 422 });
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toBeTruthy();
  });

  it("network error (no status) → retryable internet message", () => {
    const r = classifyError(new Error("ECONNREFUSED"));
    expect(r.retryable).toBe(true);
    expect(r.userMessage).toMatch(/reach Supabase/i);
  });

  it("PostgREST missing-column error → non-retryable, surfaces real message + code", () => {
    const pgErr = Object.assign(
      new Error("Could not find the 'foo' column of 'visits' in the schema cache"),
      { name: "PostgrestError", code: "PGRST204", details: "", hint: "" }
    );
    const r = classifyError(pgErr);
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toMatch(/Could not find the 'foo' column/);
    expect(r.userMessage).toMatch(/PGRST204/);
  });

  it("PostgREST FK-violation error → non-retryable", () => {
    const pgErr = Object.assign(
      new Error("insert or update on table \"visit_tests\" violates foreign key constraint"),
      { name: "PostgrestError", code: "23503", details: "Key (visit_id)=(x) is not present in table \"visits\".", hint: "" }
    );
    const r = classifyError(pgErr);
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toMatch(/23503/);
  });

  it("PostgREST transient connection error (08xxx) → retryable", () => {
    const pgErr = Object.assign(new Error("connection failure"), {
      name: "PostgrestError", code: "08006", details: "", hint: "",
    });
    expect(classifyError(pgErr).retryable).toBe(true);
  });

  it("fetch failure wrapped in PostgREST shape (empty code) → retryable network error", () => {
    // postgrest-js wraps a failed fetch (connect timeout / offline) as an object
    // shaped like a PostgrestError but with an EMPTY code. Must NOT be treated as
    // a hard non-retryable PostgREST error.
    const netErr = {
      message: "TypeError: fetch failed",
      details: "ConnectTimeoutError: Connect Timeout Error (UND_ERR_CONNECT_TIMEOUT)",
      hint: "",
      code: "",
    };
    const r = classifyError(netErr);
    expect(r.retryable).toBe(true);
    expect(r.userMessage).toMatch(/reach Supabase/i);
  });

  it("unknown object without status → retryable internet message", () => {
    const r = classifyError({ code: "NETWORK_ERROR" });
    expect(r.retryable).toBe(true);
    expect(r.userMessage).toMatch(/reach Supabase/i);
  });
});

// ─── createSupabaseClient ──────────────────────────────────────────────────────

describe("createSupabaseClient.pushRow — create", () => {
  it("calls upsert with snake_case payload and onConflict:'id'", async () => {
    mocks.setFromResult({ id: "p1" }, null);
    const client = createSupabaseClient(CONFIG);
    await client.pushRow({
      tableName: "patients",
      operation: "create",
      rowId: "p1",
      payload: { id: "p1", name: "Ravi" },
    });

    expect(mocks.fromBuilder.upsert).toHaveBeenCalledWith(
      { id: "p1", name: "Ravi" },
      { onConflict: "id" }
    );
  });
});

describe("createSupabaseClient.pushRow — update", () => {
  it("also uses upsert with onConflict:'id'", async () => {
    mocks.setFromResult({ id: "p2" }, null);
    const client = createSupabaseClient(CONFIG);
    await client.pushRow({
      tableName: "patients",
      operation: "update",
      rowId: "p2",
      payload: { id: "p2", name: "Priya" },
    });

    expect(mocks.fromBuilder.upsert).toHaveBeenCalledWith(
      { id: "p2", name: "Priya" },
      { onConflict: "id" }
    );
  });
});

describe("createSupabaseClient.pushRow — delete", () => {
  it("calls delete().eq('id', rowId)", async () => {
    mocks.setFromResult(null, null);
    const client = createSupabaseClient(CONFIG);
    await client.pushRow({
      tableName: "patients",
      operation: "delete",
      rowId: "p3",
      payload: null,
    });

    expect(mocks.fromBuilder.delete).toHaveBeenCalled();
    expect(mocks.fromBuilder.eq).toHaveBeenCalledWith("id", "p3");
  });
});

describe("createSupabaseClient.pushRow — error handling", () => {
  it("throws ClassifiedSupabaseError when Supabase returns an error", async () => {
    mocks.setFromResult(null, { status: 401, message: "JWT invalid" });
    const client = createSupabaseClient(CONFIG);

    await expect(
      client.pushRow({
        tableName: "patients",
        operation: "create",
        rowId: "p4",
        payload: { id: "p4" },
      })
    ).rejects.toMatchObject({ retryable: false, userMessage: expect.stringMatching(/authentication failed/i) });
  });
});

describe("createSupabaseClient.testConnection", () => {
  it("returns latencyMs on success", async () => {
    mocks.setFromResult([], null);
    const client = createSupabaseClient(CONFIG);
    const result = await client.testConnection();
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("throws ClassifiedSupabaseError on Supabase error", async () => {
    mocks.setFromResult(null, { status: 403, message: "Forbidden" });
    const client = createSupabaseClient(CONFIG);
    await expect(client.testConnection()).rejects.toMatchObject({
      retryable: false,
      userMessage: expect.stringMatching(/authentication failed/i),
    });
  });
});

describe("createSupabaseClient.fetchUnprocessedPaymentEvents", () => {
  it("calls is/gt/order/limit on payment_events table", async () => {
    const row = { event_id: "e1", event: "payment.captured", razorpay_payload: {}, received_at: "2026-01-01T00:00:00Z", processed_at: null };
    mocks.setFromResult([row], null);

    const client = createSupabaseClient(CONFIG);
    const rows = await client.fetchUnprocessedPaymentEvents("2026-01-01T00:00:00Z", 50);

    expect(rows).toHaveLength(1);
    expect(mocks.fromBuilder.is).toHaveBeenCalledWith("processed_at", null);
    expect(mocks.fromBuilder.gt).toHaveBeenCalledWith("received_at", "2026-01-01T00:00:00Z");
    expect(mocks.fromBuilder.order).toHaveBeenCalled();
    expect(mocks.fromBuilder.limit).toHaveBeenCalledWith(50);
  });
});

describe("createSupabaseClient.markPaymentEventProcessed", () => {
  it("calls update with processed_at and eq on event_id", async () => {
    mocks.setFromResult(null, null);
    const client = createSupabaseClient(CONFIG);
    await client.markPaymentEventProcessed("e1");

    expect(mocks.fromBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ processed_at: expect.any(String) })
    );
    expect(mocks.fromBuilder.eq).toHaveBeenCalledWith("event_id", "e1");
  });
});

describe("createSupabaseClient.fetchFreeTierStatus", () => {
  it("returns the first row ordered by recorded_at desc", async () => {
    const row = { db_size_bytes: 1000, db_size_pretty: "1 kB", auth_users: 0, recorded_at: "2026-01-01T00:00:00Z" };
    mocks.setFromResult([row], null);

    const client = createSupabaseClient(CONFIG);
    const result = await client.fetchFreeTierStatus();

    expect(result).toEqual(row);
    expect(mocks.fromBuilder.order).toHaveBeenCalledWith("recorded_at", expect.objectContaining({ ascending: false }));
    expect(mocks.fromBuilder.limit).toHaveBeenCalledWith(1);
  });

  it("returns null when no rows", async () => {
    mocks.setFromResult([], null);
    const client = createSupabaseClient(CONFIG);
    const result = await client.fetchFreeTierStatus();
    expect(result).toBeNull();
  });
});

describe("createSupabaseClient.fetchColumnInfo", () => {
  it("calls rpc with table_names", async () => {
    const cols = [{ table_name: "patients", column_name: "id", data_type: "uuid" }];
    mocks.setRpcResult(cols, null);

    const client = createSupabaseClient(CONFIG);
    const result = await client.fetchColumnInfo(["patients", "visits"]);

    expect(result).toEqual(cols);
    // rpc is called on the supabase client, not fromBuilder
    const supabaseInstance = mocks.createClient.mock.results[0]?.value as { rpc: ReturnType<typeof vi.fn> };
    expect(supabaseInstance.rpc).toHaveBeenCalledWith("information_schema_columns", {
      table_names: ["patients", "visits"],
    });
  });
});
