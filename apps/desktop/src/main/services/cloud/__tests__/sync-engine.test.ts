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

  it("does not count a failed handler as pulled", async () => {
    const engine = new SyncEngine();
    engine.register({ name: "ok", pull: async () => {} });
    engine.register({
      name: "bad",
      pull: async () => {
        throw new Error("nope");
      },
    });

    const stats = await engine.runPulls({} as never);

    expect(stats.pulled).toBe(1);
  });
});
