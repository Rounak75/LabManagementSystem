import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const counters = await prisma.idCounter.findMany();
  for (const c of counters) {
    const [kind, yearStr] = c.id.split(":");
    if (!kind || !yearStr) continue;
    const prefix = `${kind === "patient" ? "LAB" : "VIS"}-${yearStr}-`;
    if (c.lastValue <= 0) continue;
    await prisma.idReservation.upsert({
      where: { prefix_number: { prefix, number: c.lastValue } },
      create: {
        prefix,
        number: c.lastValue,
        consumedAt: c.updatedAt,
        source: "desktop",
      },
      update: {},
    });
    console.log(`Seeded ${prefix}${c.lastValue}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
