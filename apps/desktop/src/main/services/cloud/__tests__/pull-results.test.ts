import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  deadLetterFindUnique: vi.fn(),
  deadLetterUpsert: vi.fn(),
  deadLetterFindMany: vi.fn(),
  syncCursorUpsert: vi.fn(),
  testResultFindUnique: vi.fn(),
  testResultUpsert: vi.fn(),
  testParameterFindMany: vi.fn(),
  testParameterFindUnique: vi.fn(),
  visitTestFindMany: vi.fn(),
  visitTestFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  labSettingsFindUnique: vi.fn(),
  // Typed args so assertions can read what pull-results actually handed over —
  // the reference-range bounds and the child-age boundary it resolved.
  isAbnormal: vi.fn((_input: Record<string, unknown>, _override?: unknown) => false),
  auditTry: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    syncDeadLetter: { findUnique: mocks.deadLetterFindUnique, upsert: mocks.deadLetterUpsert, findMany: mocks.deadLetterFindMany },
    testResult: { findUnique: mocks.testResultFindUnique, upsert: mocks.testResultUpsert },
    testParameter: { findMany: mocks.testParameterFindMany, findUnique: mocks.testParameterFindUnique },
    visitTest: { findMany: mocks.visitTestFindMany, findUnique: mocks.visitTestFindUnique },
    user: { findMany: mocks.userFindMany, findUnique: mocks.userFindUnique },
    labSettings: { findUnique: mocks.labSettingsFindUnique },
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
  mocks.deadLetterFindMany.mockResolvedValue([]);
  mocks.testResultFindUnique.mockResolvedValue(null);
  mocks.testParameterFindMany.mockResolvedValue([]);
  mocks.visitTestFindMany.mockResolvedValue([]);
  mocks.userFindMany.mockResolvedValue([{ id: "u1" }]);
  mocks.testParameterFindUnique.mockResolvedValue({ id: "param1" });
  mocks.visitTestFindUnique.mockResolvedValue({ id: "vt1" });
  mocks.userFindUnique.mockResolvedValue({ id: "u1" });
  mocks.labSettingsFindUnique.mockResolvedValue({ childAgeBoundary: 12 });
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

  // The boundary was hardcoded to 18 here while results typed on the desktop
  // used labSettings.childAgeBoundary, so the same value for the same patient
  // was judged against a different range depending on where it was entered.
  describe("which age counts as a child", () => {
    const numericParam = {
      id: "param1",
      resultType: "Numeric",
      refRangeMaleMin: 4,
      refRangeMaleMax: 7,
      refRangeFemaleMin: 4,
      refRangeFemaleMax: 7,
      refRangeChildMin: 1,
      refRangeChildMax: 3,
      qualitativeOptions: null,
      normalQualitative: null,
    };

    beforeEach(() => {
      mocks.testParameterFindMany.mockResolvedValue([numericParam]);
      mocks.visitTestFindMany.mockResolvedValue([
        { id: "vt1", isLocked: false, visit: { patient: { sex: "Male", age: 15 } } },
      ]);
    });

    it("uses the boundary the lab has configured", async () => {
      mocks.labSettingsFindUnique.mockResolvedValue({ childAgeBoundary: 12 });
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([resultRow({ id: "r-age" })]),
      });

      await pullResults(cloud);

      expect(mocks.isAbnormal.mock.calls[0]![0].childAgeBoundary).toBe(12);
    });

    it("follows the setting when the lab raises it", async () => {
      mocks.labSettingsFindUnique.mockResolvedValue({ childAgeBoundary: 18 });
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([resultRow({ id: "r-age" })]),
      });

      await pullResults(cloud);

      expect(mocks.isAbnormal.mock.calls[0]![0].childAgeBoundary).toBe(18);
    });

    it("passes the parameter's ranges straight through, without converting", async () => {
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([resultRow({ id: "r-age" })]),
      });

      await pullResults(cloud);

      const arg = mocks.isAbnormal.mock.calls[0]![0];
      expect(arg.refRangeChildMin).toBe(1);
      expect(arg.refRangeChildMax).toBe(3);
      expect(arg.refRangeMaleMin).toBe(4);
    });

    // A settings read that failed used to be caught by the same handler as the
    // caches below it, leaving every cache empty — which threw the result out
    // rather than flagging it against a default boundary.
    it("still applies the result when the settings read fails", async () => {
      mocks.labSettingsFindUnique.mockRejectedValue(new Error("db locked"));
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([resultRow({ id: "r-age" })]),
      });

      await pullResults(cloud);

      expect(mocks.testResultUpsert).toHaveBeenCalledOnce();
      expect(mocks.isAbnormal.mock.calls[0]![0].childAgeBoundary).toBe(12);
    });
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

  // enteredById is a foreign key. The cloud value was passed straight through
  // with `?? ""`, and an empty string matches no User row — so the insert failed
  // the constraint and a result a staff member had actually typed was retried
  // until it was quarantined.
  describe("who the result is attributed to", () => {
    beforeEach(() => {
      mocks.visitTestFindMany.mockResolvedValue([
        { id: "vt1", isLocked: false, visit: { staffId: "staff-9", patient: { sex: "Male", age: 30 } } },
      ]);
    });

    it("keeps the author when this machine knows them", async () => {
      mocks.userFindMany.mockResolvedValue([{ id: "u1" }]);
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([resultRow()]) });

      await pullResults(cloud);

      expect(mocks.testResultUpsert.mock.calls[0]![0].create.enteredById).toBe("u1");
    });

    it("attributes to the visit's staff when the author is unknown here", async () => {
      mocks.userFindMany.mockResolvedValue([]);
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([resultRow()]) });

      await pullResults(cloud);

      expect(mocks.testResultUpsert).toHaveBeenCalledOnce();
      expect(mocks.testResultUpsert.mock.calls[0]![0].create.enteredById).toBe("staff-9");
    });

    it("attributes to the visit's staff when the cloud sent no author at all", async () => {
      const cloud = makeFakeCloudClient({
        pullSince: vi.fn().mockResolvedValue([resultRow({ entered_by_user_id: null })]),
      });

      await pullResults(cloud);

      expect(mocks.testResultUpsert.mock.calls[0]![0].create.enteredById).toBe("staff-9");
    });

    // Better quarantined with a reason than inserted against a constraint that
    // will reject it every time.
    it("gives up when there is no staff member to fall back to either", async () => {
      mocks.userFindMany.mockResolvedValue([]);
      mocks.visitTestFindMany.mockResolvedValue([{ id: "vt1", isLocked: false, visit: null }]);
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([resultRow()]) });

      await pullResults(cloud);

      expect(mocks.testResultUpsert).not.toHaveBeenCalled();
      expect(mocks.deadLetterUpsert).toHaveBeenCalled();
    });
  });

  // Every id on the row is a foreign key and Prisma reports a violation on any of
  // them with one message naming none. The handler used to list all three, so the
  // log said a result referenced "visit_test X, parameter Y, user Z" when two of
  // the three were present and only one was the problem — which is a diagnosis
  // the reader still has to do by hand, against the production database.
  describe("when a parent row is missing", () => {
    const fkViolation = () =>
      Object.assign(new Error("Foreign key constraint violated: `foreign key`"), { code: "P2003" });

    const errorRecorded = () =>
      String(mocks.deadLetterUpsert.mock.calls[0]![0].create.error);

    beforeEach(() => {
      mocks.visitTestFindMany.mockResolvedValue([
        { id: "vt1", isLocked: false, visit: { staffId: "staff-9", patient: { sex: "Male", age: 30 } } },
      ]);
      mocks.testResultUpsert.mockRejectedValue(fkViolation());
    });

    it("names the parent this machine does not have", async () => {
      mocks.testParameterFindUnique.mockResolvedValue(null);
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([resultRow()]) });

      await pullResults(cloud);

      expect(errorRecorded()).toContain("parameter param1");
    });

    it("does not name the parents it does have", async () => {
      mocks.testParameterFindUnique.mockResolvedValue(null);
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([resultRow()]) });

      await pullResults(cloud);

      expect(errorRecorded()).not.toContain("visit_test vt1");
      expect(errorRecorded()).not.toContain("user u1");
    });

    it("names every missing parent when more than one is absent", async () => {
      mocks.testParameterFindUnique.mockResolvedValue(null);
      mocks.visitTestFindUnique.mockResolvedValue(null);
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([resultRow()]) });

      await pullResults(cloud);

      expect(errorRecorded()).toContain("parameter param1");
      expect(errorRecorded()).toContain("visit_test vt1");
    });

    it("still records something useful when every parent turns out to be present", async () => {
      const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([resultRow()]) });

      await pullResults(cloud);

      // A race, not an orphan — the constraint fired but the parents are there
      // now. Saying so is more use than naming three rows that all exist.
      expect(errorRecorded()).toContain("r1");
      expect(mocks.deadLetterUpsert).toHaveBeenCalled();
    });
  });
});
