// Shared test double for the cloud client.
//
// Why this exists: the pull modules take their client by injection, so a test
// must pass a fake in — mocking `createSupabaseClient` does nothing, because the
// modules never call the factory. Every pull test previously mocked the factory
// and then passed `{}`, which meant the first `client.<method>()` call threw and
// the module bailed out of its top-level catch. Assertions of the form
// `expect(x).not.toHaveBeenCalled()` still passed, so those tests reported green
// while exercising nothing.
//
// `satisfies CloudClient` is the load-bearing part: it makes a rename or removal
// on the real client a compile error here, so the fake cannot drift out of sync
// with production again.

import { vi } from "vitest";
import type { CloudClient } from "../../sync-engine";

export type FakeCloudClient = {
  [K in keyof CloudClient]: ReturnType<typeof vi.fn>;
};

/**
 * Builds a fake cloud client whose methods are all spies resolving to empty
 * results. Override just the ones a test cares about:
 *
 *   const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([row]) });
 *   await pullPatients(cloud);
 *   expect(cloud.pullSince).toHaveBeenCalledWith("patients", "updated_at", ...);
 */
export function makeFakeCloudClient(overrides: Partial<FakeCloudClient> = {}): FakeCloudClient {
  const base = {
    pushRow: vi.fn().mockResolvedValue(undefined),
    pushBatch: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn().mockResolvedValue({ latencyMs: 1 }),
    fetchUnprocessedPaymentEvents: vi.fn().mockResolvedValue([]),
    markPaymentEventProcessed: vi.fn().mockResolvedValue(undefined),
    fetchFreeTierStatus: vi.fn().mockResolvedValue(null),
    fetchColumnInfo: vi.fn().mockResolvedValue([]),
    pushHeartbeat: vi.fn().mockResolvedValue(undefined),
    pullSince: vi.fn().mockResolvedValue([]),
    fetchVisitTestsForVisit: vi.fn().mockResolvedValue([]),
    fetchVisitTestsForVisits: vi.fn().mockResolvedValue([]),
    fetchInvoicesForVisits: vi.fn().mockResolvedValue([]),
  };

  // Fails to compile if the real CloudClient gains, loses, or renames a method.
  const _contract = base satisfies Record<keyof CloudClient, unknown>;
  void _contract;

  return { ...base, ...overrides };
}
