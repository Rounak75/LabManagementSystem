import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  deadLetterFindUnique: vi.fn(),
  deadLetterUpsert: vi.fn(),
  syncCursorUpsert: vi.fn(),
  printJobFindUnique: vi.fn(),
  printJobUpsert: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    syncDeadLetter: { findUnique: mocks.deadLetterFindUnique, upsert: mocks.deadLetterUpsert },
    printJob: { findUnique: mocks.printJobFindUnique, upsert: mocks.printJobUpsert },
  }),
}));

import { pullPrintJobs } from "../pull-print-jobs";

function printJobRow(over: Record<string, unknown> = {}) {
  return {
    id: "pj1",
    visit_id: "v1",
    requested_by_id: "u1",
    requested_at: "2026-05-20T16:00:00Z",
    status: "Queued",
    picked_up_at: null,
    completed_at: null,
    error_message: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindUnique.mockResolvedValue(null);
  mocks.printJobFindUnique.mockResolvedValue(null);
});

describe("pullPrintJobs", () => {
  it("only asks the cloud for Queued jobs, on the requested_at cursor", async () => {
    const cloud = makeFakeCloudClient();
    await pullPrintJobs(cloud);
    expect(cloud.pullSince).toHaveBeenCalledWith(
      "print_jobs",
      "requested_at",
      new Date(0).toISOString(),
      100,
      { status: "Queued" },
      undefined,
    );
  });

  it("inserts a new Queued PrintJob and marks it Picked locally", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([printJobRow()]),
    });

    await pullPrintJobs(cloud);

    expect(mocks.printJobUpsert).toHaveBeenCalledOnce();
    const arg = mocks.printJobUpsert.mock.calls[0]![0];
    expect(arg.create.status).toBe("Picked");
    expect(arg.create.visitId).toBe("v1");
    expect(arg.update.status).toBe("Picked");
  });

  it("does not re-pick a job already in non-Queued status locally", async () => {
    mocks.printJobFindUnique.mockResolvedValue({ id: "pj2", status: "Done" });
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([printJobRow({ id: "pj2", visit_id: "v2" })]),
    });

    await pullPrintJobs(cloud);

    expect(mocks.printJobUpsert).not.toHaveBeenCalled();
  });

  it("advances the sync cursor", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        printJobRow({ id: "pj3", visit_id: "v3", requested_at: "2026-05-20T17:30:00Z" }),
      ]),
    });

    await pullPrintJobs(cloud);

    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
    const arg = mocks.syncCursorUpsert.mock.calls[0]![0];
    expect(arg.where.source).toBe("print_jobs");
    expect((arg.update.lastSyncedAt as Date).toISOString()).toBe("2026-05-20T17:30:00.000Z");
  });
});
