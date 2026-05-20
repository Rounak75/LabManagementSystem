import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Admin "Unlock to edit" for a verified-locked VisitTest.
 *
 * The unlock logic lives in `unlockVisitTest` (extracted from the IPC
 * handler closure so it can be called directly from tests). It:
 *   - requires Admin role (FORBIDDEN otherwise)
 *   - requires reason.trim().length >= 10 (REASON_REQUIRED otherwise)
 *   - refuses when invoice.paymentStatus === "Paid" (INVOICE_PAID_BEFORE_UNLOCK)
 *   - refuses when VisitTest doesn't exist (NOT_FOUND)
 *   - on success: writes { isLocked: false, status: "ResultEntered", verifiedAt: null }
 *     and best-effort audits "RESULT_UNLOCKED".
 */

// `@main/ipc` imports `ipcMain` at module load, which is unavailable in
// the vitest jsdom env — same pattern used by concurrencyVersion.test.ts.
// `app.getPath` is touched by audit-best-effort's fallback file logger;
// we don't expect it to fire on the happy path (audit succeeds), but stub
// it anyway so a stray call doesn't blow up the test.
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "." }
}));

vi.mock("@main/db", () => {
  const prismaState = {
    visitTest: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    visit: { update: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  return { prisma: () => prismaState, __state: prismaState };
});

import { unlockVisitTest } from "../visits.ipc";
import { setSession } from "@main/session";
import * as db from "@main/db";

const state = (db as any).__state;

beforeEach(() => {
  vi.clearAllMocks();
  setSession({ id: "admin-1", username: "admin", name: "Admin User", role: "Admin" });
  state.visitTest.update.mockResolvedValue({});
  state.auditLog.create.mockResolvedValue({});
});

describe("visitTests:unlock", () => {
  it("requires Admin role", async () => {
    setSession({ id: "staff-1", username: "staff", name: "Staff One", role: "Staff" });
    await expect(
      unlockVisitTest({ visitTestId: "vt1", reason: "wrong sodium value entered" })
    ).rejects.toThrow("FORBIDDEN");
    expect(state.visitTest.update).not.toHaveBeenCalled();
  });

  it("requires reason >= 10 chars (after trim)", async () => {
    await expect(
      unlockVisitTest({ visitTestId: "vt1", reason: "short" })
    ).rejects.toThrow("REASON_REQUIRED");
    await expect(
      unlockVisitTest({ visitTestId: "vt1", reason: "          " })
    ).rejects.toThrow("REASON_REQUIRED");
    expect(state.visitTest.update).not.toHaveBeenCalled();
  });

  it("refuses when invoice is Paid", async () => {
    state.visitTest.findUnique.mockResolvedValue({
      id: "vt1",
      visitId: "v1",
      isLocked: true,
      verifiedAt: new Date(),
      visit: { invoice: { paymentStatus: "Paid" } }
    });
    await expect(
      unlockVisitTest({ visitTestId: "vt1", reason: "wrong sodium value entered" })
    ).rejects.toThrow("INVOICE_PAID_BEFORE_UNLOCK");
    expect(state.visitTest.update).not.toHaveBeenCalled();
  });

  it("refuses if visitTest not found", async () => {
    state.visitTest.findUnique.mockResolvedValue(null);
    await expect(
      unlockVisitTest({ visitTestId: "missing", reason: "wrong sodium value entered" })
    ).rejects.toThrow("NOT_FOUND");
  });

  it("unlocks and writes audit log", async () => {
    const verifiedAt = new Date();
    state.visitTest.findUnique.mockResolvedValue({
      id: "vt1",
      visitId: "v1",
      isLocked: true,
      verifiedAt,
      visit: { invoice: null }
    });

    const result = await unlockVisitTest({
      visitTestId: "vt1",
      reason: "wrong sodium value entered"
    });

    expect(result).toEqual({ isLocked: false });
    expect(state.visitTest.update).toHaveBeenCalledWith({
      where: { id: "vt1" },
      data: { isLocked: false, status: "ResultEntered", verifiedAt: null }
    });
    // audit.try wraps audit.service.audit, which calls prisma().auditLog.create.
    expect(state.auditLog.create).toHaveBeenCalledTimes(1);
    const auditArg = state.auditLog.create.mock.calls[0][0];
    expect(auditArg.data.action).toBe("RESULT_UNLOCKED");
    expect(auditArg.data.targetEntity).toBe("VisitTest");
    expect(auditArg.data.targetId).toBe("vt1");
    expect(auditArg.data.userId).toBe("admin-1");
    // details is JSON-serialized (audit-best-effort stringifies objects).
    const details = JSON.parse(auditArg.data.details);
    expect(details.reason).toBe("wrong sodium value entered");
  });
});
