import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory model of IdReservation + IdCounter.
// reservations is keyed by `${prefix}:${number}` for uniqueness checks.
const reservations = new Map<string, { id: string; prefix: string; number: number; source: string; consumedAt: Date | null }>();
let nextResId = 1;
const counters = new Map<string, number>();

// Ids already stamped on rows that arrived from the cloud. The desktop's own
// reservation table knows nothing about these, which is the whole bug.
const syncedVisitIds: string[] = [];
const syncedPatientIds: string[] = [];

/** Highest-first by string; ids are zero-padded to 5 digits so this is numeric order. */
function topMatching(values: string[], prefix: string) {
  const matches = values.filter((v) => v.startsWith(prefix)).sort().reverse();
  return matches[0] ?? null;
}

const fakePrisma = {
  visit: {
    findFirst: async ({ where }: any) => {
      const top = topMatching(syncedVisitIds, where?.visitId?.startsWith ?? "");
      return top ? { visitId: top } : null;
    },
  },
  patient: {
    findFirst: async ({ where }: any) => {
      const top = topMatching(syncedPatientIds, where?.patientId?.startsWith ?? "");
      return top ? { patientId: top } : null;
    },
  },
  idReservation: {
    findFirst: async ({ where: { prefix }, orderBy }: any) => {
      const rows = [...reservations.values()].filter((r) => r.prefix === prefix);
      if (rows.length === 0) return null;
      // orderBy: { number: "desc" }
      rows.sort((a, b) => b.number - a.number);
      return rows[0];
    },
    create: async ({ data }: any) => {
      const key = `${data.prefix}:${data.number}`;
      if (reservations.has(key)) {
        const err: any = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
      const row = {
        id: String(nextResId++),
        prefix: data.prefix,
        number: data.number,
        source: data.source ?? "desktop",
        consumedAt: data.consumedAt ?? null,
      };
      reservations.set(key, row);
      return row;
    },
    deleteMany: async () => {
      reservations.clear();
    },
  },
  idCounter: {
    findUnique: async ({ where: { id } }: any) =>
      counters.has(id) ? { id, lastValue: counters.get(id) } : null,
    upsert: async ({ where: { id }, create, update }: any) => {
      const value = "lastValue" in update ? update.lastValue : create.lastValue;
      counters.set(id, value);
      return { id, lastValue: value };
    },
    deleteMany: async () => {
      counters.clear();
    },
  },
};

vi.mock("@main/db", () => ({ prisma: () => fakePrisma }));

import { nextPatientId, nextVisitId, numberFromId } from "../id-generator";

describe("id-generator with IdReservation", () => {
  beforeEach(() => {
    reservations.clear();
    counters.clear();
    syncedVisitIds.length = 0;
    syncedPatientIds.length = 0;
    nextResId = 1;
  });

  it("formats LAB-YYYY-NNNNN starting at 00001 for the year", async () => {
    const id = await nextPatientId(new Date("2026-04-29T10:00:00Z"));
    expect(id).toBe("LAB-2026-00001");
  });

  it("increments within the same year", async () => {
    await nextPatientId(new Date("2026-01-01T00:00:00Z"));
    const second = await nextPatientId(new Date("2026-12-31T23:59:00Z"));
    expect(second).toBe("LAB-2026-00002");
  });

  it("resets on new year", async () => {
    await nextPatientId(new Date("2026-12-31T10:00:00Z"));
    const fresh = await nextPatientId(new Date("2027-01-01T00:01:00Z"));
    expect(fresh).toBe("LAB-2027-00001");
  });

  it("uses VIS prefix for visits", async () => {
    const id = await nextVisitId(new Date("2026-04-29T10:00:00Z"));
    expect(id).toBe("VIS-2026-00001");
  });

  it("nextVisitId inserts an IdReservation row tagged as desktop source", async () => {
    const id = await nextVisitId(new Date("2026-05-20"));
    expect(id).toBe("VIS-2026-00001");
    const row = [...reservations.values()].find((r) => r.prefix === "VIS-2026-" && r.number === 1);
    expect(row).toBeTruthy();
    expect(row?.source).toBe("desktop");
  });

  it("respects existing IdReservation rows from cloud (admin source)", async () => {
    reservations.set("VIS-2026-:1", {
      id: "preexisting",
      prefix: "VIS-2026-",
      number: 1,
      source: "admin",
      consumedAt: null,
    });
    nextResId = 2;
    const id = await nextVisitId(new Date("2026-05-20"));
    expect(id).toBe("VIS-2026-00002");
  });

  it("races: unique-constraint loser retries with bumped number", async () => {
    // Simulate the race-resolve path by pre-populating a row at the number
    // the loop would attempt first, then ensuring the next attempt succeeds.
    reservations.set("VIS-2026-:1", {
      id: "racewinner",
      prefix: "VIS-2026-",
      number: 1,
      source: "admin",
      consumedAt: null,
    });
    nextResId = 2;
    const id = await nextVisitId(new Date("2026-05-20"));
    expect(id).toBe("VIS-2026-00002");
  });

  it("also maintains legacy IdCounter alongside IdReservation", async () => {
    await nextPatientId(new Date("2026-05-20"));
    expect(counters.get("patient:2026")).toBe(1);
    await nextPatientId(new Date("2026-05-20"));
    expect(counters.get("patient:2026")).toBe(2);
  });
});

// Regression tests for duplicate human-facing IDs.
//
// Production symptom:
//   push id_reservations/b7821db6…: duplicate key value violates unique
//   constraint "id_reservations_prefix_number_key" [23505]
//
// The 23505 is the cloud constraint doing its job, but by the time it fires the
// desktop has already stamped that number onto a real visit — so two visits
// carry the same VIS-2026-NNNNN. A constraint can refuse a duplicate row; it
// cannot un-print a report.
//
// Cause: two allocators sharing nothing. The desktop reads its high-water mark
// from local SQLite. The admin portal reads its own from cloud `id_reservations`
// via the reserve-visit-id Edge Function. Nothing pulls cloud reservations down
// — sync-registry has no handler for them — so when the admin allocates #3 the
// desktop still believes #2 is the top and issues #3 to somebody else.
//
// The fix widens what counts as proof a number is taken: not only the desktop's
// own reservation rows, but any id already stamped on a Visit or Patient that
// has synced down. Those arrive through the existing pull handlers, so this
// needs no new network call and keeps working offline.
describe("ids allocated by the admin portal", () => {
  beforeEach(() => {
    reservations.clear();
    counters.clear();
    syncedVisitIds.length = 0;
    syncedPatientIds.length = 0;
    nextResId = 1;
  });

  it("does not reissue a visit number already stamped on a synced visit", async () => {
    // The exact production case: admin created VIS-2026-00003 in the cloud and
    // it has synced down. The desktop's own reservations only reach #2.
    reservations.set("VIS-2026-:2", {
      id: "local", prefix: "VIS-2026-", number: 2, source: "desktop", consumedAt: null,
    });
    nextResId = 2;
    syncedVisitIds.push("VIS-2026-00003");

    expect(await nextVisitId(new Date("2026-07-28"))).toBe("VIS-2026-00004");
  });

  it("does not reissue a patient number already stamped on a synced patient", async () => {
    syncedPatientIds.push("LAB-2026-00099");
    expect(await nextPatientId(new Date("2026-07-28"))).toBe("LAB-2026-00100");
  });

  it("takes the highest across every source", async () => {
    reservations.set("VIS-2026-:9", {
      id: "r", prefix: "VIS-2026-", number: 9, source: "desktop", consumedAt: null,
    });
    nextResId = 2;
    counters.set("visit:2026", 4);
    syncedVisitIds.push("VIS-2026-00006");

    expect(await nextVisitId(new Date("2026-07-28"))).toBe("VIS-2026-00010");
  });

  it("keeps the two series independent — a high visit id must not burn patient ids", async () => {
    syncedVisitIds.push("VIS-2026-09999");
    syncedPatientIds.push("LAB-2026-00002");

    expect(await nextPatientId(new Date("2026-07-28"))).toBe("LAB-2026-00003");
  });

  it("ignores ids from a previous year", async () => {
    syncedVisitIds.push("VIS-2025-00900");
    expect(await nextVisitId(new Date("2026-07-28"))).toBe("VIS-2026-00001");
  });
});

describe("numberFromId", () => {
  it("reads the sequence number out of a formatted id", () => {
    expect(numberFromId("VIS-2026-00003", "VIS-2026-")).toBe(3);
    expect(numberFromId("LAB-2026-00099", "LAB-2026-")).toBe(99);
    expect(numberFromId("VIS-2026-01234", "VIS-2026-")).toBe(1234);
  });

  it("ignores ids belonging to a different prefix or year", () => {
    expect(numberFromId("VIS-2025-00900", "VIS-2026-")).toBe(0);
    expect(numberFromId("LAB-2026-00007", "VIS-2026-")).toBe(0);
  });

  it("treats anything unparseable as no evidence rather than throwing", () => {
    expect(numberFromId(null, "VIS-2026-")).toBe(0);
    expect(numberFromId(undefined, "VIS-2026-")).toBe(0);
    expect(numberFromId("", "VIS-2026-")).toBe(0);
    expect(numberFromId("VIS-2026-", "VIS-2026-")).toBe(0);
    expect(numberFromId("VIS-2026-ABCDE", "VIS-2026-")).toBe(0);
  });
});
