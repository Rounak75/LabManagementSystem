import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Optimistic concurrency check on results:upsert.
 *
 * The upsert logic lives in `upsertResults` (extracted from the IPC handler
 * closure so it can be called directly from tests). It throws
 * `Error("STALE_VERSION")` when `expectedVersion` does not match the
 * highest current TestResult.version for the visitTest. On success it
 * bumps every row's version by 1 and returns the new version.
 */

// Mock electron because `@main/ipc` imports `ipcMain` at module load,
// which is unavailable in the vitest jsdom env.
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() }
}));

// Mock prisma per existing convention (see services/__tests__/users.test.ts).
vi.mock("@main/db", () => {
  const prismaState = {
    visitTest: { findUnique: vi.fn(), update: vi.fn() },
    testResult: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn()
    },
    testParameter: { findMany: vi.fn() },
    labSettings: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() }
  };
  return { prisma: () => prismaState, __state: prismaState };
});

import { upsertResults } from "../results.ipc";
import { setSession } from "@main/session";
import * as db from "@main/db";

const state = (db as any).__state;

function makeVisitTest() {
  return {
    id: "vt1",
    testId: "t1",
    isLocked: false,
    visit: { patient: { sex: "Male", age: 30 } },
    test: {
      parameters: [
        {
          id: "p1",
          resultType: "Numeric",
          refRangeMaleMin: null,
          refRangeMaleMax: null,
          refRangeFemaleMin: null,
          refRangeFemaleMax: null,
          refRangeChildMin: null,
          refRangeChildMax: null,
          qualitativeOptions: null,
          normalQualitative: null
        }
      ]
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setSession({ id: "u1", username: "u1", name: "User One", role: "Admin" });
  state.labSettings.findUnique.mockResolvedValue({ childAgeBoundary: 12 });
  state.visitTest.findUnique.mockResolvedValue(makeVisitTest());
  state.visitTest.update.mockResolvedValue({});
  state.testResult.findMany.mockResolvedValue([]);
  state.testResult.upsert.mockResolvedValue({});
  state.auditLog.create.mockResolvedValue({});
});

describe("results:upsert version check", () => {
  it("rejects when expectedVersion does not match current version", async () => {
    // current row is at v2; client tries to save with expectedVersion 1
    state.testResult.findFirst.mockResolvedValue({ version: 2 });

    await expect(
      upsertResults({
        visitTestId: "vt1",
        values: [{ parameterId: "p1", value: "10" }],
        expectedVersion: 1
      })
    ).rejects.toThrow("STALE_VERSION");

    // We must not have written anything on a stale save.
    expect(state.testResult.upsert).not.toHaveBeenCalled();
  });

  it("succeeds with matching version and bumps the version on update", async () => {
    state.testResult.findFirst
      // first call: the concurrency check sees v1
      .mockResolvedValueOnce({ version: 1 })
      // last call: read newest version to return — now v2
      .mockResolvedValueOnce({ version: 2 });

    const result = await upsertResults({
      visitTestId: "vt1",
      values: [{ parameterId: "p1", value: "10" }],
      expectedVersion: 1
    });

    expect(result).toMatchObject({ ok: true, version: 2 });
    // The update branch must increment version by 1.
    const upsertArg = state.testResult.upsert.mock.calls[0][0];
    expect(upsertArg.update).toMatchObject({ version: { increment: 1 } });
    // The create branch must NOT set version explicitly — schema default(1) wins.
    expect(upsertArg.create.version).toBeUndefined();
  });

  it("succeeds when expectedVersion is undefined (first save, no existing row)", async () => {
    // No prior row → findFirst returns null on the concurrency check,
    // and again returns null when we look up the "newest" version after upsert.
    state.testResult.findFirst.mockResolvedValue(null);

    const result = await upsertResults({
      visitTestId: "vt1",
      values: [{ parameterId: "p1", value: "10" }]
    });

    expect(result).toMatchObject({ ok: true });
    expect(state.testResult.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("results:upsert notes + abnormalOverride persistence", () => {
  it("persists notes and abnormalOverride=true (override wins over computed)", async () => {
    state.testResult.findFirst.mockResolvedValue(null);

    await upsertResults({
      visitTestId: "vt1",
      values: [{
        parameterId: "p1",
        value: "12.5",
        notes: "draw was difficult",
        abnormalOverride: true
      }]
    });

    const arg = state.testResult.upsert.mock.calls[0][0];
    expect(arg.create.notes).toBe("draw was difficult");
    expect(arg.create.abnormalOverride).toBe(true);
    expect(arg.create.isAbnormal).toBe(true); // override wins
    expect(arg.update.notes).toBe("draw was difficult");
    expect(arg.update.abnormalOverride).toBe(true);
    expect(arg.update.isAbnormal).toBe(true);
    // Task 5 version-bump must still be present.
    expect(arg.update.version).toEqual({ increment: 1 });
  });

  it("persists abnormalOverride=false (forces normal even when value is out of range)", async () => {
    state.testResult.findFirst.mockResolvedValue(null);
    // Use a visitTest with a real numeric range so auto would be true.
    state.visitTest.findUnique.mockResolvedValue({
      id: "vt1",
      testId: "t1",
      isLocked: false,
      visit: { patient: { sex: "Male", age: 30 } },
      test: {
        parameters: [{
          id: "p1",
          resultType: "Numeric",
          refRangeMaleMin: 10, refRangeMaleMax: 14,
          refRangeFemaleMin: null, refRangeFemaleMax: null,
          refRangeChildMin: null, refRangeChildMax: null,
          qualitativeOptions: null, normalQualitative: null
        }]
      }
    });

    await upsertResults({
      visitTestId: "vt1",
      values: [{ parameterId: "p1", value: "20", abnormalOverride: false }]
    });

    const arg = state.testResult.upsert.mock.calls[0][0];
    expect(arg.create.abnormalOverride).toBe(false);
    expect(arg.create.isAbnormal).toBe(false); // override wins over out-of-range
  });

  it("treats null abnormalOverride as auto (computed)", async () => {
    state.testResult.findFirst.mockResolvedValue(null);
    state.visitTest.findUnique.mockResolvedValue({
      id: "vt1",
      testId: "t1",
      isLocked: false,
      visit: { patient: { sex: "Male", age: 30 } },
      test: {
        parameters: [{
          id: "p1",
          resultType: "Numeric",
          refRangeMaleMin: 10, refRangeMaleMax: 14,
          refRangeFemaleMin: null, refRangeFemaleMax: null,
          refRangeChildMin: null, refRangeChildMax: null,
          qualitativeOptions: null, normalQualitative: null
        }]
      }
    });

    await upsertResults({
      visitTestId: "vt1",
      values: [{ parameterId: "p1", value: "20", abnormalOverride: null }]
    });

    const arg = state.testResult.upsert.mock.calls[0][0];
    expect(arg.create.abnormalOverride).toBeNull();
    expect(arg.create.isAbnormal).toBe(true); // auto-detected: 20 > 14
  });

  it("defaults notes and abnormalOverride to null when omitted", async () => {
    state.testResult.findFirst.mockResolvedValue(null);

    await upsertResults({
      visitTestId: "vt1",
      values: [{ parameterId: "p1", value: "10" }]
    });

    const arg = state.testResult.upsert.mock.calls[0][0];
    expect(arg.create.notes).toBeNull();
    expect(arg.create.abnormalOverride).toBeNull();
    expect(arg.update.notes).toBeNull();
    expect(arg.update.abnormalOverride).toBeNull();
  });
});
