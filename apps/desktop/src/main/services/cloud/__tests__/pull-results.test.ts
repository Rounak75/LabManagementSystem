import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  syncCursorUpsert: vi.fn(),
  testResultFindUnique: vi.fn(),
  testResultUpsert: vi.fn(),
  testParameterFindMany: vi.fn(),
  visitTestFindMany: vi.fn(),
  isAbnormal: vi.fn(() => false),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    testResult: { findUnique: mocks.testResultFindUnique, upsert: mocks.testResultUpsert },
    testParameter: { findMany: mocks.testParameterFindMany },
    visitTest: { findMany: mocks.visitTestFindMany },
  }),
}));
vi.mock("@main/services/abnormality", () => ({ isAbnormal: mocks.isAbnormal }));

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
  mocks.testResultFindUnique.mockResolvedValue(null);
  mocks.testParameterFindMany.mockResolvedValue([]);
  mocks.visitTestFindMany.mockResolvedValue([]);
  mocks.isAbnormal.mockReturnValue(false);
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
