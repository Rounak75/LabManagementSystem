// Phase 3d Plan B — per-printer X/Y offsets in millimeters for ContentOnly
// printing onto the lab's pre-printed letterhead. Local only (never synced).
// Offsets clamped to ±20mm so a typo can't shoot text off the page.

import { prisma } from "@main/db";

export interface Calibration {
  xOffsetMm: number;
  yOffsetMm: number;
}

const MAX_OFFSET_MM = 20;
const clamp = (v: number) => Math.max(-MAX_OFFSET_MM, Math.min(MAX_OFFSET_MM, v));

const ZERO: Calibration = { xOffsetMm: 0, yOffsetMm: 0 };

export async function getCalibration(printerName: string): Promise<Calibration> {
  if (!printerName) return ZERO;
  const row = await prisma().printerCalibration.findUnique({
    where: { printerName },
  });
  return row
    ? { xOffsetMm: row.xOffsetMm, yOffsetMm: row.yOffsetMm }
    : ZERO;
}

export async function upsertCalibration(
  printerName: string,
  calibration: Calibration
): Promise<void> {
  const x = clamp(calibration.xOffsetMm);
  const y = clamp(calibration.yOffsetMm);
  await prisma().printerCalibration.upsert({
    where: { printerName },
    create: { printerName, xOffsetMm: x, yOffsetMm: y },
    update: { xOffsetMm: x, yOffsetMm: y },
  });
}

export async function listAllCalibrations(): Promise<
  Array<{ printerName: string } & Calibration>
> {
  const rows = await prisma().printerCalibration.findMany();
  return rows.map((r) => ({
    printerName: r.printerName,
    xOffsetMm: r.xOffsetMm,
    yOffsetMm: r.yOffsetMm,
  }));
}
