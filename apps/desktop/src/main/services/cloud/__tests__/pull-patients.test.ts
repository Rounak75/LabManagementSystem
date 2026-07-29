import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeCloudClient } from "./helpers/fake-cloud-client";

const mocks = vi.hoisted(() => ({
  syncCursorFindUnique: vi.fn(),
  deadLetterFindUnique: vi.fn(),
  deadLetterUpsert: vi.fn(),
  deadLetterFindMany: vi.fn(),
  syncCursorUpsert: vi.fn(),
  patientUpsert: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    syncCursor: { findUnique: mocks.syncCursorFindUnique, upsert: mocks.syncCursorUpsert },
    syncDeadLetter: { findUnique: mocks.deadLetterFindUnique, upsert: mocks.deadLetterUpsert, findMany: mocks.deadLetterFindMany },
    patient: { upsert: mocks.patientUpsert },
  }),
}));

import { pullPatients } from "../pull-patients";

function patientRow(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    patient_id: "LAB-2026-00100",
    name: "Test Patient",
    phone: "9999999999",
    email: null,
    age: 30,
    sex: "Male",
    address: null,
    source: "admin",
    referred_by_id: null,
    created_by_id: "u1",
    portal_account_id: null,
    created_at: "2026-05-20T10:00:00Z",
    updated_at: "2026-05-20T10:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncCursorFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindUnique.mockResolvedValue(null);
  mocks.deadLetterFindMany.mockResolvedValue([]);
});

describe("pullPatients", () => {
  it("queries the patients table on the updated_at cursor", async () => {
    const cloud = makeFakeCloudClient();
    await pullPatients(cloud);
    expect(cloud.pullSince).toHaveBeenCalledWith(
      "patients",
      "updated_at",
      new Date(0).toISOString(),
      100,
      undefined,
      undefined,
    );
  });

  it("inserts a new admin-source patient into local SQLite", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([patientRow()]),
    });

    await pullPatients(cloud);

    expect(mocks.patientUpsert).toHaveBeenCalledOnce();
    const arg = mocks.patientUpsert.mock.calls[0]![0];
    expect(arg.where.id).toBe("p1");
    expect(arg.create.name).toBe("Test Patient");
    expect(arg.create.patientId).toBe("LAB-2026-00100");
  });

  it("skips desktop-source rows (they came from our own outbox)", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([patientRow({ id: "p2", source: "desktop" })]),
    });

    await pullPatients(cloud);

    expect(mocks.patientUpsert).not.toHaveBeenCalled();
    // Cursor must still advance, or the row is re-fetched forever.
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("skips soft-deleted rows", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        patientRow({ id: "p5", deleted_at: "2026-05-21T10:00:00Z" }),
      ]),
    });

    await pullPatients(cloud);

    expect(mocks.patientUpsert).not.toHaveBeenCalled();
    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
  });

  it("advances the sync cursor to the latest updated_at across rows", async () => {
    const cloud = makeFakeCloudClient({
      pullSince: vi.fn().mockResolvedValue([
        patientRow({ id: "p3", updated_at: "2026-05-20T11:30:00Z" }),
        patientRow({ id: "p4", source: "desktop", updated_at: "2026-05-20T11:45:00Z" }),
      ]),
    });

    await pullPatients(cloud);

    expect(mocks.syncCursorUpsert).toHaveBeenCalledOnce();
    const arg = mocks.syncCursorUpsert.mock.calls[0]![0];
    expect(arg.where.source).toBe("patients");
    expect((arg.update.lastSyncedAt as Date).toISOString()).toBe("2026-05-20T11:45:00.000Z");
    expect(arg.update.lastId).toBe("p4");
  });

  it("resumes from a stored cursor, passing lastId for tie-breaking", async () => {
    mocks.syncCursorFindUnique.mockResolvedValue({
      source: "patients",
      lastSyncedAt: new Date("2026-05-20T11:00:00Z"),
      lastId: "p9",
    });
    const cloud = makeFakeCloudClient();

    await pullPatients(cloud);

    expect(cloud.pullSince).toHaveBeenCalledWith(
      "patients",
      "updated_at",
      "2026-05-20T11:00:00.000Z",
      100,
      undefined,
      "p9",
    );
  });

  it("does not write a cursor when the cloud returns no rows", async () => {
    const cloud = makeFakeCloudClient({ pullSince: vi.fn().mockResolvedValue([]) });
    await pullPatients(cloud);
    expect(mocks.syncCursorUpsert).not.toHaveBeenCalled();
  });
});
