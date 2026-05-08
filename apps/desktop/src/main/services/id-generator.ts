import { prisma } from "@main/db";

async function nextWithPrefix(prefix: "LAB" | "VIS", at: Date): Promise<string> {
  const year = at.getUTCFullYear();
  const counterId = `${prefix === "LAB" ? "patient" : "visit"}:${year}`;
  const next = await prisma().$transaction(async (tx: any) => {
    const existing = await tx.idCounter.findUnique({ where: { id: counterId } });
    const lastValue = existing ? existing.lastValue + 1 : 1;
    await tx.idCounter.upsert({
      where: { id: counterId },
      create: { id: counterId, lastValue },
      update: { lastValue }
    });
    return lastValue;
  });
  return `${prefix}-${year}-${String(next).padStart(5, "0")}`;
}

export const nextPatientId = (at: Date = new Date()) => nextWithPrefix("LAB", at);
export const nextVisitId   = (at: Date = new Date()) => nextWithPrefix("VIS", at);
