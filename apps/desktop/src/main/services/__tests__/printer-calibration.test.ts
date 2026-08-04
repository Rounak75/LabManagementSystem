import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCalibration,
  upsertCalibration,
  listAllCalibrations,
} from "../printer-calibration.service";

/**
 * Calibration offsets decide where text lands on the lab's pre-printed
 * letterhead, so what is worth asserting is the service's own arithmetic — the
 * ±20mm clamp, the zero default for a printer nobody has calibrated, and that
 * a second save updates rather than piling up rows.
 *
 * The table is stood up in memory rather than in Prisma. Reaching a real
 * database meant reading DATABASE_URL, which lives in a developer's untracked
 * .env and nowhere else — so this file passed on the machine it was written on
 * and failed everywhere else, CI included. The fake still stores and returns
 * rows, so the assertions below are about the service, not about which Prisma
 * calls it happened to make.
 */

interface CalibrationRow {
  printerName: string;
  xOffsetMm: number;
  yOffsetMm: number;
}

const db = vi.hoisted(() => {
  const rows = new Map<string, CalibrationRow>();
  return {
    rows,
    findUnique: async ({ where }: { where: { printerName: string } }) =>
      rows.get(where.printerName) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { printerName: string };
      create: CalibrationRow;
      update: Omit<CalibrationRow, "printerName">;
    }) => {
      const existing = rows.get(where.printerName);
      const row = existing ? { ...existing, ...update } : { ...create };
      rows.set(where.printerName, row);
      return row;
    },
    findMany: async () => [...rows.values()],
  };
});

vi.mock("@main/db", () => ({
  prisma: () => ({
    printerCalibration: {
      findUnique: db.findUnique,
      upsert: db.upsert,
      findMany: db.findMany,
    },
  }),
}));

describe("printer-calibration.service", () => {
  beforeEach(() => {
    db.rows.clear();
  });

  it("returns zero offsets for an unknown printer", async () => {
    const cal = await getCalibration("Unknown Printer");
    expect(cal).toEqual({ xOffsetMm: 0, yOffsetMm: 0 });
  });

  it("upserts and reads back the saved offsets", async () => {
    await upsertCalibration("HP LaserJet M1005", { xOffsetMm: 1.5, yOffsetMm: -2 });
    const cal = await getCalibration("HP LaserJet M1005");
    expect(cal).toEqual({ xOffsetMm: 1.5, yOffsetMm: -2 });
  });

  it("upsert is idempotent — second call updates instead of inserts", async () => {
    await upsertCalibration("Printer A", { xOffsetMm: 0.5, yOffsetMm: 0 });
    await upsertCalibration("Printer A", { xOffsetMm: 1.0, yOffsetMm: 1.0 });
    expect(await getCalibration("Printer A")).toEqual({ xOffsetMm: 1.0, yOffsetMm: 1.0 });
    expect(await listAllCalibrations()).toHaveLength(1);
  });

  it("clamps offsets to [-20, 20] mm", async () => {
    await upsertCalibration("Printer B", { xOffsetMm: 999, yOffsetMm: -999 });
    expect(await getCalibration("Printer B")).toEqual({ xOffsetMm: 20, yOffsetMm: -20 });
  });
});
