import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireSession } from "@main/session";

register("dashboard:stats", async () => {
  const me = requireSession();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const yStart = new Date(startOfDay);
  yStart.setDate(yStart.getDate() - 1);

  const [
    visitsToday,
    visitsYesterday,
    testsToday,
    reportsToday,
    reportsPending,
    pendingResults,
    openVisits,
    outsourcedSent,
  ] = await Promise.all([
    prisma().visit.count({ where: { visitDate: { gte: startOfDay, lt: endOfDay } } }),
    prisma().visit.count({ where: { visitDate: { gte: yStart, lt: startOfDay } } }),
    prisma().visitTest.count({ where: { createdAt: { gte: startOfDay, lt: endOfDay } } }),
    prisma().visit.count({
      where: { status: "Completed", updatedAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma().visit.count({ where: { status: { not: "Completed" } } }),
    prisma().visitTest.count({ where: { isLocked: false, resultEnteredAt: { not: null } } }),
    prisma().visit.count({ where: { status: "Open" } }),
    prisma().visitTest.count({ where: { outsourcedStatus: "Sent" } }),
  ]);

  const today = {
    visits: visitsToday,
    tests: testsToday,
    reports: reportsToday,
    reportsPending,
    deltaVisits: visitsToday - visitsYesterday,
  };
  const backlog = { pendingResults, openVisits, outsourcedSent };

  if (me.role !== "Admin") return { today, money: null, backlog };

  const invoicesToday = await prisma().invoice.findMany({
    where: { createdAt: { gte: startOfDay, lt: endOfDay } },
    select: { total: true, amountPaid: true, discountAmount: true },
  });
  const sum = (k: "total" | "amountPaid" | "discountAmount") =>
    invoicesToday.reduce((s: number, i: any) => s + Number(i[k]), 0);
  const money = {
    billed: sum("total"),
    collected: sum("amountPaid"),
    discount: sum("discountAmount"),
  };

  return { today, money, backlog };
});
