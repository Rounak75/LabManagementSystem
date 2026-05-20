import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  labSettingsFindUnique: vi.fn(),
  labSettingsUpdate: vi.fn(),
  patientFindMany: vi.fn(),
  visitFindMany: vi.fn(),
}));

vi.mock("../outbox.service", () => ({ enqueue: mocks.enqueue }));
vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique, update: mocks.labSettingsUpdate },
    patient: { findMany: mocks.patientFindMany },
    visit: { findMany: mocks.visitFindMany },
    visitTest: { findMany: vi.fn().mockResolvedValue([]) },
    result: { findMany: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    doctor: { findMany: vi.fn().mockResolvedValue([]) },
    test: { findMany: vi.fn().mockResolvedValue([]) },
    parameter: { findMany: vi.fn().mockResolvedValue([]) },
    homeVisit: { findMany: vi.fn().mockResolvedValue([]) },
  }),
}));

import { runBackfillOnce } from "../backfill.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.patientFindMany.mockResolvedValue([]);
  mocks.visitFindMany.mockResolvedValue([]);
});

describe("runBackfillOnce", () => {
  it("no-op if backfillCompletedAt is set", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: true, backfillCompletedAt: new Date() });
    await runBackfillOnce();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("no-op if sync disabled", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: false, backfillCompletedAt: null });
    await runBackfillOnce();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues create events for each row in synced tables and sets backfillCompletedAt", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: true, backfillCompletedAt: null });
    mocks.patientFindMany.mockResolvedValueOnce([{ id: "p-1" }, { id: "p-2" }]).mockResolvedValueOnce([]);
    mocks.visitFindMany.mockResolvedValueOnce([{ id: "v-1" }]).mockResolvedValueOnce([]);
    await runBackfillOnce();
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ tableName: "patients", rowId: "p-1", operation: "create" }));
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ tableName: "patients", rowId: "p-2" }));
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ tableName: "visits", rowId: "v-1" }));
    expect(mocks.labSettingsUpdate).toHaveBeenCalledWith({
      where: { id: "singleton" },
      data: { backfillCompletedAt: expect.any(Date) },
    });
  });

  it("pages through rows by id cursor", async () => {
    mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: true, backfillCompletedAt: null });
    mocks.patientFindMany
      .mockResolvedValueOnce([{ id: "p-1" }])
      .mockResolvedValueOnce([]);
    await runBackfillOnce();
    expect(mocks.patientFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.patientFindMany.mock.calls[1]![0]).toMatchObject({
      cursor: { id: "p-1" },
      skip: 1,
    });
  });
});
