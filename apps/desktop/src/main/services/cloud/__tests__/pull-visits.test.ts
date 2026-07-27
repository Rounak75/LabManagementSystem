import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  deadLetterFindUnique: vi.fn(),
  deadLetterUpsert: vi.fn(),
  syncCursorUpsert: vi.fn(),
  visitUpsert: vi.fn(),
  visitTestUpsert: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    syncDeadLetter: { findUnique: mocks.deadLetterFindUnique, upsert: mocks.deadLetterUpsert },
    visit: { upsert: mocks.visitUpsert },
    visitTest: { upsert: mocks.visitTestUpsert },
  }),
}));

import { pullVisits } from "../pull-visits";

function visitRow(over: Record<string, unknown> = {}) {
  return {
    id: "v1",
    visit_id: "VIS-2026-00010",
    patient_id: "p1",
    type: "WalkIn",
    visit_date: "2026-05-20T08:00:00Z",
    status: "Open",
    staff_id: "u1",
    access_code_hash: null,
    source: "admin",
    verified_by_user_id: null,
    verified_at: null,
    created_at: "2026-05-20T08:00:00Z",
    updated_at: "2026-05-20T08:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindUnique.mockResolvedValue(null);
});

describe("pullVisits", () => {
  it("inserts admin-source visit + its VisitTests (from the visit_tests table)", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([visitRow()]),
      fetchVisitTestsForVisits: vi.fn().mockResolvedValue([
        { id: "vt1", visit_id: "v1", test_id: "t1", status: "Collected" },
        { id: "vt2", visit_id: "v1", test_id: "t2", status: "Pending" },
      ]),
    });

    await pullVisits(cloud);

    expect(mocks.visitUpsert).toHaveBeenCalledOnce();
    expect(mocks.visitUpsert.mock.calls[0]![0].create.visitId).toBe("VIS-2026-00010");
    expect(cloud.fetchVisitTestsForVisits).toHaveBeenCalledWith(["v1"]);
    expect(mocks.visitTestUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.visitTestUpsert.mock.calls[0]![0].where.id).toBe("vt1");
    expect(mocks.visitTestUpsert.mock.calls[0]![0].create.testId).toBe("t1");
    expect(mocks.visitTestUpsert.mock.calls[1]![0].create.status).toBe("Pending");
  });

  it("fetches visit_tests for the whole batch in one call (no N+1)", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        visitRow({ id: "v1" }),
        visitRow({ id: "v2", visit_id: "VIS-2026-00011" }),
        visitRow({ id: "v3", visit_id: "VIS-2026-00012" }),
      ]),
    });

    await pullVisits(cloud);

    expect(cloud.fetchVisitTestsForVisits).toHaveBeenCalledOnce();
    expect(cloud.fetchVisitTestsForVisits).toHaveBeenCalledWith(["v1", "v2", "v3"]);
  });

  it("assigns each child visit_test to its own visit", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        visitRow({ id: "v1" }),
        visitRow({ id: "v2", visit_id: "VIS-2026-00011" }),
      ]),
      fetchVisitTestsForVisits: vi.fn().mockResolvedValue([
        { id: "vt1", visit_id: "v1", test_id: "t1", status: "Collected" },
        { id: "vt2", visit_id: "v2", test_id: "t2", status: "Collected" },
      ]),
    });

    await pullVisits(cloud);

    const byId = new Map(
      mocks.visitTestUpsert.mock.calls.map((c) => [c[0].where.id, c[0].create.visitId]),
    );
    expect(byId.get("vt1")).toBe("v1");
    expect(byId.get("vt2")).toBe("v2");
  });

  it("skips desktop-source visits but still advances cursor", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([visitRow({ id: "v2", source: "desktop" })]),
    });

    await pullVisits(cloud);

    expect(mocks.visitUpsert).not.toHaveBeenCalled();
    expect(mocks.visitTestUpsert).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("upserts no children when the visit has no visit_tests", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([visitRow({ id: "v3" })]),
      fetchVisitTestsForVisits: vi.fn().mockResolvedValue([]),
    });

    await pullVisits(cloud);

    expect(mocks.visitUpsert).toHaveBeenCalledOnce();
    expect(mocks.visitTestUpsert).not.toHaveBeenCalled();
  });

  it("skips soft-deleted visits", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        visitRow({ id: "v4", deleted_at: "2026-05-21T08:00:00Z" }),
      ]),
    });

    await pullVisits(cloud);

    expect(mocks.visitUpsert).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });
});
