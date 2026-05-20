import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  labSettingsFindUnique: vi.fn(),
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  patientFindMany: vi.fn(),
  outboxFindMany: vi.fn(),
}));

vi.mock("../outbox.service", () => ({ enqueue: mocks.enqueue }));
vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique },
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    patient: { findMany: mocks.patientFindMany },
    visit: { findMany: vi.fn().mockResolvedValue([]) },
    visitTest: { findMany: vi.fn().mockResolvedValue([]) },
    result: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    doctor: { findMany: vi.fn().mockResolvedValue([]) },
    test: { findMany: vi.fn().mockResolvedValue([]) },
    parameter: { findMany: vi.fn().mockResolvedValue([]) },
    homeVisit: { findMany: vi.fn().mockResolvedValue([]) },
    outbox: { findMany: mocks.outboxFindMany },
  }),
}));

import { runReconciliation } from "../reconciliation";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: true, backfillCompletedAt: new Date(0) });
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.patientFindMany.mockResolvedValue([]);
  mocks.outboxFindMany.mockResolvedValue([]);
});

describe("runReconciliation", () => {
  it("re-enqueues 'update' events for rows missing from outbox", async () => {
    mocks.patientFindMany.mockResolvedValue([
      { id: "p-1", updatedAt: new Date(1) },
      { id: "p-2", updatedAt: new Date(2) },
    ]);
    mocks.outboxFindMany.mockResolvedValue([{ rowId: "p-1" }]);
    await runReconciliation();
    expect(mocks.enqueue).toHaveBeenCalledWith({
      tableName: "patients", operation: "update", rowId: "p-2",
      payload: expect.objectContaining({ id: "p-2" }),
    });
  });

  it("no-op when sync disabled", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: false });
    await runReconciliation();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("no-op when backfill hasn't completed", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: true, backfillCompletedAt: null });
    await runReconciliation();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
