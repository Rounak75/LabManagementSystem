// The "don't sync when cloud is disabled / unconfigured" gate used to be asserted
// in each pull module's test, but the modules no longer read LabSettings — the
// engine decides, once, in loadClient(). These tests cover it where it now lives.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  labSettingsFindUnique: vi.fn(),
  decryptSecret: vi.fn((s: string) => s.replace("enc:", "")),
  createSupabaseClient: vi.fn(() => ({ tag: "cloud-client" })),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({ labSettings: { findUnique: mocks.labSettingsFindUnique } }),
}));
vi.mock("@main/services/crypto.service", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("../supabase-client", () => ({ createSupabaseClient: mocks.createSupabaseClient }));

import { SyncEngine } from "../sync-engine";

const configured = {
  cloudSyncEnabled: true,
  supabaseUrl: "https://project.supabase.co",
  supabaseAnonKey: "anon",
  supabaseServiceKey: "enc:service",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue(configured);
});

describe("SyncEngine.loadClient", () => {
  it("returns a client when cloud sync is enabled and fully configured", async () => {
    const client = await new SyncEngine().loadClient();
    expect(client).not.toBeNull();
    expect(mocks.createSupabaseClient).toHaveBeenCalledWith({
      url: "https://project.supabase.co",
      serviceKey: "service", // decrypted before use
      anonKey: "anon",
    });
  });

  it("returns null when cloud sync is disabled", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ ...configured, cloudSyncEnabled: false });
    expect(await new SyncEngine().loadClient()).toBeNull();
    expect(mocks.createSupabaseClient).not.toHaveBeenCalled();
  });

  it("returns null when settings are missing entirely", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue(null);
    expect(await new SyncEngine().loadClient()).toBeNull();
    expect(mocks.createSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(["supabaseUrl", "supabaseAnonKey", "supabaseServiceKey"])(
    "returns null when %s is not configured",
    async (missing) => {
      mocks.labSettingsFindUnique.mockResolvedValue({ ...configured, [missing]: null });
      expect(await new SyncEngine().loadClient()).toBeNull();
      expect(mocks.createSupabaseClient).not.toHaveBeenCalled();
    },
  );
});

describe("SyncEngine.runPulls", () => {
  it("runs dependencies before the handlers that declare them", async () => {
    const order: string[] = [];
    const engine = new SyncEngine();
    engine.register({
      name: "results",
      dependencies: ["visits"],
      pull: async () => void order.push("results"),
    });
    engine.register({
      name: "visits",
      dependencies: ["patients"],
      pull: async () => void order.push("visits"),
    });
    engine.register({ name: "patients", pull: async () => void order.push("patients") });

    await engine.runPulls({} as never);

    expect(order.indexOf("patients")).toBeLessThan(order.indexOf("visits"));
    expect(order.indexOf("visits")).toBeLessThan(order.indexOf("results"));
  });

  it("keeps running later handlers when one throws, and reports the failure", async () => {
    const engine = new SyncEngine();
    const after = vi.fn();
    engine.register({
      name: "a-broken",
      pull: async () => {
        throw new Error("cloud rejected the read");
      },
    });
    engine.register({ name: "b-healthy", pull: after });

    const stats = await engine.runPulls({} as never);

    expect(after).toHaveBeenCalledOnce();
    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0]).toContain("a-broken");
    expect(stats.errors[0]).toContain("cloud rejected the read");
  });

  // `pulled` is documented as "cloud rows successfully applied locally", and the
  // sync worker calls a tick idle when nothing was pushed and nothing pulled. It
  // counted handlers that ran instead, which is a constant ten while the cloud is
  // reachable — so `idle` was never true, the tick never backed off from five
  // seconds to sixty, and the free-tier cost control the backoff exists to
  // provide had no effect at any point, including overnight with the lab shut.
  describe("counting what was pulled", () => {
    it("reports rows applied, not handlers run", async () => {
      const engine = new SyncEngine();
      engine.register({ name: "a", pull: async () => ({ applied: 3, skipped: 0, failed: 0 }) });
      engine.register({ name: "b", pull: async () => ({ applied: 1, skipped: 0, failed: 0 }) });

      const stats = await engine.runPulls({} as never);

      expect(stats.pulled).toBe(4);
    });

    it("reports nothing pulled when every handler found no new rows", async () => {
      const engine = new SyncEngine();
      engine.register({ name: "a", pull: async () => ({ applied: 0, skipped: 0, failed: 0 }) });
      engine.register({ name: "b", pull: async () => ({ applied: 0, skipped: 2, failed: 0 }) });

      const stats = await engine.runPulls({} as never);

      // Skipped rows are rows we deliberately did nothing with — echoes of our own
      // pushes, soft-deletes, rows the replayer owns. They are not activity.
      expect(stats.pulled).toBe(0);
    });

    it("counts nothing for a handler that reports no stats", async () => {
      const engine = new SyncEngine();
      engine.register({ name: "heartbeat", pull: async () => {} });

      expect((await engine.runPulls({} as never)).pulled).toBe(0);
    });

    it("does not count rows from a handler that threw", async () => {
      const engine = new SyncEngine();
      engine.register({ name: "ok", pull: async () => ({ applied: 2, skipped: 0, failed: 0 }) });
      engine.register({
        name: "bad",
        pull: async () => {
          throw new Error("nope");
        },
      });

      const stats = await engine.runPulls({} as never);

      expect(stats.pulled).toBe(2);
      expect(stats.errors).toHaveLength(1);
    });
  });
});
