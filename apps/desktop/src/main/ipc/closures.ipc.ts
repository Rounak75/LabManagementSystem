// Phase 3d Plan H — single-day lab closures (festivals, holidays, manual).
// The portal booking form hides any date that matches a row here.

import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireAdmin, requireSession } from "@main/session";

register("closures:list", async () => {
  requireSession();
  return prisma().labClosure.findMany({
    orderBy: { date: "asc" },
    where: { date: { gte: new Date(new Date().toDateString()) } },
  });
});

register("closures:upsert", async ({
  date,
  reason,
}: { date: string; reason?: string }) => {
  requireAdmin();
  // Normalise to UTC midnight so the unique constraint matches by day.
  const d = new Date(date);
  const norm = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const cleanReason = reason?.trim() || null;
  // Explicit find→create-or-update (not prisma.upsert) so the cloud-sync
  // outbox hook fires — upsert is filtered out of prisma-hooks to prevent
  // pull-from-cloud paths (pull-bookings, pull-disputes) from looping back.
  const existing = await prisma().labClosure.findUnique({ where: { date: norm } });
  if (existing) {
    return prisma().labClosure.update({
      where: { id: existing.id },
      data: { reason: cleanReason },
    });
  }
  return prisma().labClosure.create({ data: { date: norm, reason: cleanReason } });
});

register("closures:remove", async ({ id }: { id: string }) => {
  requireAdmin();
  await prisma().labClosure.delete({ where: { id } });
  return { ok: true };
});
