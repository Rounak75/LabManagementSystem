import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  labSettingsFindUnique: vi.fn(),
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  patientFindMany: vi.fn(),
  visitFindMany: vi.fn(),
  labSettingsFindMany: vi.fn(),
  outboxFindMany: vi.fn(),
}));

vi.mock("../outbox.service", () => ({ enqueue: mocks.enqueue }));
vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: { findUnique: mocks.labSettingsFindUnique, findMany: mocks.labSettingsFindMany },
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
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
    outbox: { findMany: mocks.outboxFindMany },
  }),
}));

import { runReconciliation } from "../reconciliation";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: true, backfillCompletedAt: new Date(0) });
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.patientFindMany.mockResolvedValue([]);
  mocks.visitFindMany.mockResolvedValue([]);
  mocks.labSettingsFindMany.mockResolvedValue([]);
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

  // Reconciliation assembled its own payload and skipped sanitizeForCloud, so a
  // row repaired here went to the cloud raw — unlike the same row pushed by the
  // live hook or the backfill.
  it("strips the plaintext access code from a repaired Visit", async () => {
    mocks.visitFindMany.mockResolvedValue([
      {
        id: "v-1",
        visitId: "LAB-2026-00001",
        accessCodeHash: "$2b$10$hash",
        accessCodePlaintext: "SECRET42",
        updatedAt: new Date(1),
      },
    ]);

    await runReconciliation();

    const call = mocks.enqueue.mock.calls.find(([a]) => a.tableName === "visits");
    expect(call).toBeDefined();
    const payload = call![0].payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("access_code_plaintext");
    expect(payload.access_code_hash).toBe("$2b$10$hash");
    expect(payload.visit_id).toBe("LAB-2026-00001");
  });

  it("keeps LabSettings secrets out of a repaired row", async () => {
    mocks.labSettingsFindMany.mockResolvedValue([
      {
        id: "singleton",
        labName: "Golmuri Diagnostics",
        supabaseServiceKey: "enc:service-key",
        emailSmtpPassword: "enc:smtp-password",
        razorpayKeySecret: "enc:razorpay-secret",
        updatedAt: new Date(1),
      },
    ]);

    await runReconciliation();

    const call = mocks.enqueue.mock.calls.find(([a]) => a.tableName === "lab_settings");
    expect(call).toBeDefined();
    const payload = call![0].payload as Record<string, unknown>;
    expect(payload.lab_name).toBe("Golmuri Diagnostics");
    expect(payload).not.toHaveProperty("supabase_service_key");
    expect(payload).not.toHaveProperty("email_smtp_password");
    expect(payload).not.toHaveProperty("razorpay_key_secret");
  });
});
