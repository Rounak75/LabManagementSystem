import { prisma } from "@main/db";

async function nextWithPrefix(kind: "LAB" | "VIS", at: Date): Promise<string> {
  const year = at.getUTCFullYear();
  const prefix = `${kind}-${year}-`;

  for (let attempt = 0; attempt < 20; attempt++) {
    const last = await prisma().idReservation.findFirst({
      where: { prefix },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const next = (last?.number ?? 0) + 1;
    try {
      await prisma().idReservation.create({
        data: {
          prefix,
          number: next,
          source: "desktop",
          consumedAt: new Date(),
        },
      });
      const counterId = `${kind === "LAB" ? "patient" : "visit"}:${year}`;
      await prisma().idCounter.upsert({
        where: { id: counterId },
        create: { id: counterId, lastValue: next },
        update: { lastValue: next },
      });
      return `${prefix}${String(next).padStart(5, "0")}`;
    } catch (e: any) {
      if (e?.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("id-generator: too many races on " + prefix);
}

export const nextPatientId = (at: Date = new Date()) => nextWithPrefix("LAB", at);
export const nextVisitId = (at: Date = new Date()) => nextWithPrefix("VIS", at);
