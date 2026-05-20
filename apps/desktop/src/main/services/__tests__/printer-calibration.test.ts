import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@main/db";
import {
  getCalibration,
  upsertCalibration,
  listAllCalibrations,
} from "../printer-calibration.service";

describe("printer-calibration.service", () => {
  beforeEach(async () => {
    await prisma().printerCalibration.deleteMany();
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
