import { describe, it, expect, beforeEach, vi } from "vitest";

const counters = new Map<string, number>();
const fakePrisma = {
  $transaction: async (fn: any) => fn(fakePrisma),
  idCounter: {
    findUnique: async ({ where: { id } }: any) =>
      counters.has(id) ? { id, lastValue: counters.get(id) } : null,
    upsert: async ({ where: { id }, create, update }: any) => {
      const next = counters.has(id) ? (counters.get(id)! + 1) : create.lastValue;
      counters.set(id, next);
      return { id, lastValue: next };
    }
  }
};

vi.mock("@main/db", () => ({ prisma: () => fakePrisma }));

import { nextPatientId, nextVisitId } from "../id-generator";

describe("id-generator", () => {
  beforeEach(() => counters.clear());

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
});
