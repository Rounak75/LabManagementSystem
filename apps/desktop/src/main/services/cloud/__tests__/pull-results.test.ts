import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  deadLetterFindUnique: vi.fn(),
  deadLetterUpsert: vi.fn(),
  syncCursorUpsert: vi.fn(),
  testResultFindUnique: vi.fn(),
  testResultUpsert: vi.fn(),
  testParameterFindMany: vi.fn(),
  visitTestFindMany: vi.fn(),
  isAbnormal: vi.fn(() => false),
  auditTry: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    syncDeadLetter: { findUnique: mocks.deadLetterFindUnique, upsert: mocks.deadLetterUpsert },
    testResult: { findUnique: mocks.testResultFindUnique, upsert: mocks.testResultUpsert },
    testParameter: { findMany: mocks.testParameterFindMany },
    visitTest: { findMany: mocks.visitTestFindMany },
  }),
}));
vi.mock("@main/services/abnormality", () => ({ isAbnormal: mocks.isAbnormal }));
vi.mock("@main/services/audit-best-effort", () => ({ audit: { try: mocks.auditTry } }));

import { pullResults } from "../pull-results";

function resultRow(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    visit_test_id: "vt1",
    parameter_id: "param1",
    value: "5.4",
    is_abnormal: false,
    abnormal_override: null,
    notes: null,
    version: 1,
    entered_by_user_id: "u1",
    entered_at: "2026-05-20T12:00:00Z",
    updated_at: "2026-05-20T12:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindUnique.mockResolvedValue(null);
  mocks.testResultFindUnique.mockResolvedValue(null);
  mocks.testParameterFindMany.mockResolvedValue([]);
  mocks.visitTestFindMany.mockResolvedValue([]);
  mocks.isAbnormal.mockReturnValue(false);
  mocks.auditTry.mockResolvedValue(undefined);
});

describe("pullResults", () => {
  it("inserts a new admin-source result", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([resultRow()]),
    });

    await pullResults(cloud);

    expect(mocks.testResultUpsert).toHaveBeenCalledOnce();
    const arg = mocks.testResultUpsert.mock.calls[0]![0];
    expect(arg.create.value).toBe("5.4");
    expect(arg.create.parameterId).toBe("param1");
  });

  it("respects local version > cloud version (does not overwrite)", async () => {
    mocks.testResultFindUnique.mockResolvedValue({ id: "r2", version: 5 });
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        resultRow({ id: "r2", value: "999", is_abnormal: true, version: 3 }),
      ]),
    });

    await pullResults(cloud);

    expect(mocks.testResultUpsert).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("recomputes abnormality flag from local parameter + patient", async () => {
    mocks.testParameterFindMany.mockResolvedValue([
      {
        id: "param1",
        resultType: "Numeric",
        refRangeMaleMin: 4,
        refRangeMaleMax: 7,
        refRangeFemaleMin: 4,
        refRangeFemaleMax: 7,
        refRangeChildMin: null,
        refRangeChildMax: null,
        qualitativeOptions: null,
        normalQualitative: null,
      },
    ]);
    mocks.visitTestFindMany.mockResolvedValue([
      { id: "vt1", isLocked: false, visit: { patient: { sex: "Male", age: 35 } } },
    ]);
    mocks.isAbnormal.mockReturnValue(true);
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        // cloud said normal; the local reference-range lookup overrides it
        resultRow({ id: "r3", value: "12.0", is_abnormal: false }),
      ]),
    });

    await pullResults(cloud);

    expect(mocks.isAbnormal).toHaveBeenCalledOnce();
    expect(mocks.testResultUpsert.mock.calls[0]![0].create.isAbnormal).toBe(true);
  });

  it("falls back to the cloud abnormal flag when the parameter is not local yet", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([resultRow({ id: "r4", is_abnormal: true })]),
    });

    await pullResults(cloud);

    expect(mocks.isAbnormal).not.toHaveBeenCalled();
    expect(mocks.testResultUpsert.mock.calls[0]![0].create.isAbnormal).toBe(true);
  });

  // A verified-and-locked test has been signed off, and its report may already
  // have been printed and handed to the patient. Nothing arriving from the cloud
  // may silently rewrite it — the desktop write path enforces this
  // (results.ipc `if (vt.isLocked) throw FORBIDDEN`) and the sync path must too.
  describe("locked results", () => {
    const lockedVisitTest = {
      id: "vt1",
      isLocked: true,
      visit: { patient: { sex: "Male", age: 35 } },
    };

    it("refuses to overwrite a result whose visit test is locked", async () => {
      mocks.visitTestFindMany.mockResolvedValue([lockedVisitTest]);
      mocks.testResultFindUnique.mockResolvedValue({ id: "r1", version: 1 });
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([resultRow({ value: "999", version: 9 })]),
      });

      await pullResults(cloud);

      expect(mocks.testResultUpsert).not.toHaveBeenCalled();
    });

    it("advances the cursor past a rejected locked row so the pull cannot wedge", async () => {
      mocks.visitTestFindMany.mockResolvedValue([lockedVisitTest]);
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([resultRow({ value: "999", version: 9 })]),
      });

      await pullResults(cloud);

      expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
    });

    it("records the rejected write so the lab can see it was attempted", async () => {
      mocks.visitTestFindMany.mockResolvedValue([lockedVisitTest]);
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([resultRow({ value: "999", version: 9 })]),
      });

      await pullResults(cloud);

      expect(mocks.auditTry).toHaveBeenCalledOnce();
      const [action, input] = mocks.auditTry.mock.calls[0]!;
      expect(action).toBe("result.locked_write_rejected");
      expect(input.entityId).toBe("r1");
    });

    it("still applies results whose visit test is not locked", async () => {
      mocks.visitTestFindMany.mockResolvedValue([
        { ...lockedVisitTest, isLocked: false },
      ]);
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([resultRow()]),
      });

      await pullResults(cloud);

      expect(mocks.testResultUpsert).toHaveBeenCalledOnce();
      expect(mocks.auditTry).not.toHaveBeenCalled();
    });

    it("applies results when the visit test is not in the local cache yet", async () => {
      mocks.visitTestFindMany.mockResolvedValue([]);
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([resultRow()]),
      });

      await pullResults(cloud);

      expect(mocks.testResultUpsert).toHaveBeenCalledOnce();
    });
  });

  it("queries the results table on the updated_at cursor", async () => {
    const cloud = makeFakeCloudClient();
    await pullResults(cloud);
    expect(cloud.pullSince).toHaveBeenCalledWith(
      "results",
      "updated_at",
      new Date(0).toISOString(),
      100,
      undefined,
      undefined,
    );
  });
});
