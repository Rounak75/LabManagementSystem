import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Admin "Release report anyway" for a visit whose bill is unpaid.
 *
 * The portal withholds a verified report while a balance remains. This is the
 * owner's per-visit decision to hand it over regardless — for a regular on
 * credit, or a patient who paid in a way the system has not caught up with.
 * Without it the only options would be to record a payment that never happened,
 * corrupting the day's takings, or to tell the patient their report does not
 * exist.
 *
 * It never touches printing: the owner is standing in the lab and knows the
 * patient.
 */

// `@main/ipc` imports `ipcMain` at module load, unavailable in the vitest env.
// `app.getPath` is touched by audit-best-effort's fallback file logger.
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "." },
}));

vi.mock("@main/db", () => {
  const prismaState = {
    visit: { findUnique: vi.fn(), update: vi.fn() },
    visitTest: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { prisma: () => prismaState, __state: prismaState };
});

import { setReportReleaseOverride } from "../visits.ipc";
import { setSession } from "@main/session";
import * as db from "@main/db";

const state = (db as any).__state;

beforeEach(() => {
  vi.clearAllMocks();
  setSession({ id: "admin-1", username: "admin", name: "Admin User", role: "Admin" });
  state.visit.findUnique.mockResolvedValue({ id: "v1" });
  state.visit.update.mockResolvedValue({});
  state.auditLog.create.mockResolvedValue({});
});

describe("visits:setReportReleaseOverride", () => {
  // Waiving a bill is the owner's call, not the front desk's.
  it("requires Admin role", async () => {
    setSession({ id: "staff-1", username: "staff", name: "Staff One", role: "Staff" });
    await expect(setReportReleaseOverride({ visitId: "v1", release: true })).rejects.toThrow();
    expect(state.visit.update).not.toHaveBeenCalled();
  });

  it("refuses a visit that does not exist", async () => {
    state.visit.findUnique.mockResolvedValue(null);
    await expect(setReportReleaseOverride({ visitId: "nope", release: true })).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(state.visit.update).not.toHaveBeenCalled();
  });

  it("records who released the report, when, and why", async () => {
    const res = await setReportReleaseOverride({
      visitId: "v1",
      release: true,
      reason: "regular customer, pays monthly",
    });

    expect(res).toEqual({ released: true });
    const data = state.visit.update.mock.calls[0][0].data;
    expect(data.reportReleaseOverride).toBe(true);
    expect(data.reportReleaseOverrideByUserId).toBe("admin-1");
    expect(data.reportReleaseOverrideReason).toBe("regular customer, pays monthly");
    expect(data.reportReleaseOverrideAt).toBeInstanceOf(Date);
  });

  // A stale "released by X on Y" sitting against a visit being withheld again
  // would misrepresent who is currently accountable for it.
  it("clears the trail when the report is withheld again", async () => {
    await setReportReleaseOverride({ visitId: "v1", release: false });

    const data = state.visit.update.mock.calls[0][0].data;
    expect(data.reportReleaseOverride).toBe(false);
    expect(data.reportReleaseOverrideByUserId).toBeNull();
    expect(data.reportReleaseOverrideAt).toBeNull();
    expect(data.reportReleaseOverrideReason).toBeNull();
  });

  it("caps an over-long reason rather than rejecting the release", async () => {
    await setReportReleaseOverride({ visitId: "v1", release: true, reason: "x".repeat(900) });
    expect(state.visit.update.mock.calls[0][0].data.reportReleaseOverrideReason).toHaveLength(500);
  });
});
