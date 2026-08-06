import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  labSettingsFindUnique: vi.fn(),
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  patientFindMany: vi.fn(),
  visitFindMany: vi.fn(),
  labSettingsFindMany: vi.fn(),
  testResultFindMany: vi.fn(),
  testParameterFindMany: vi.fn(),
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
    // The Prisma accessors for the renamed models. Spelled `result` and
    // `parameter` here for as long as reconciliation asked for models by those
    // names — which is to say, for as long as it reconciled neither.
    testResult: { findMany: mocks.testResultFindMany },
    testParameter: { findMany: mocks.testParameterFindMany },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    payment: { findMany: vi.fn().mockResolvedValue([]) },
    doctor: { findMany: vi.fn().mockResolvedValue([]) },
    test: { findMany: vi.fn().mockResolvedValue([]) },
    homeVisit: { findMany: vi.fn().mockResolvedValue([]) },
    outbox: { findMany: mocks.outboxFindMany },
  }),
}));

import { runReconciliation } from "../reconciliation";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.labSettingsFindUnique.mockResolvedValue({ cloudSyncEnabled: true, backfillCompletedAt: new Date(0) });
  // A machine that has reconciled before. Without a cursor the table is only
  // primed, never read — see the "first time" tests below.
  mocks.syncCursorFindUnique.mockResolvedValue({ source: "reconcile_x", lastSyncedAt: new Date(0) });
  mocks.patientFindMany.mockResolvedValue([]);
  mocks.visitFindMany.mockResolvedValue([]);
  mocks.labSettingsFindMany.mockResolvedValue([]);
  mocks.testResultFindMany.mockResolvedValue([]);
  mocks.testParameterFindMany.mockResolvedValue([]);
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

  // MODELS asked for "Result" and "Parameter" long after the models were renamed,
  // so MODEL_TO_TABLE returned undefined and both tables were skipped entirely.
  describe("the models that were being skipped", () => {
    it("reconciles results", async () => {
      mocks.testResultFindMany.mockResolvedValue([
        { id: "r-1", value: "5.4", updatedAt: new Date(1) },
      ]);

      await runReconciliation();

      const call = mocks.enqueue.mock.calls.find(([a]) => a.tableName === "results");
      expect(call).toBeDefined();
      expect(call![0].rowId).toBe("r-1");
    });

    it("reconciles test parameters", async () => {
      mocks.testParameterFindMany.mockResolvedValue([
        { id: "tp-1", name: "Haemoglobin", updatedAt: new Date(1) },
      ]);

      await runReconciliation();

      const call = mocks.enqueue.mock.calls.find(([a]) => a.tableName === "parameters");
      expect(call).toBeDefined();
      expect(call![0].rowId).toBe("tp-1");
    });
  });

  // Reading from epoch would re-enqueue every row the outbox has since pruned —
  // on results, the lab's whole history in one go.
  describe("the first time a table is reconciled", () => {
    beforeEach(() => {
      mocks.syncCursorFindUnique.mockResolvedValue(null);
    });

    it("enqueues nothing", async () => {
      mocks.testResultFindMany.mockResolvedValue([
        { id: "r-1", updatedAt: new Date(1) },
      ]);
      mocks.patientFindMany.mockResolvedValue([
        { id: "p-1", updatedAt: new Date(1) },
      ]);

      await runReconciliation();

      expect(mocks.enqueue).not.toHaveBeenCalled();
    });

    it("does not read the table at all", async () => {
      await runReconciliation();
      expect(mocks.testResultFindMany).not.toHaveBeenCalled();
      expect(mocks.patientFindMany).not.toHaveBeenCalled();
    });

    it("starts the cursor at now, so the next pass does the work", async () => {
      const before = Date.now();
      await runReconciliation();

      const call = mocks.syncCursorUpsert.mock.calls.find(
        ([a]) => a.where.source === "reconcile_results",
      );
      expect(call).toBeDefined();
      const at = call![0].create.lastSyncedAt as Date;
      expect(at.getTime()).toBeGreaterThanOrEqual(before);
      expect(at.getTime()).toBeLessThanOrEqual(Date.now());
    });
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
