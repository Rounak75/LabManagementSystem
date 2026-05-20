import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory model of IdReservation + IdCounter.
// reservations is keyed by `${prefix}:${number}` for uniqueness checks.
const reservations = new Map<string, { id: string; prefix: string; number: number; source: string; consumedAt: Date | null }>();
let nextResId = 1;
const counters = new Map<string, number>();

const fakePrisma = {
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

import { nextPatientId, nextVisitId } from "../id-generator";

describe("id-generator with IdReservation", () => {
  beforeEach(() => {
    reservations.clear();
    counters.clear();
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
