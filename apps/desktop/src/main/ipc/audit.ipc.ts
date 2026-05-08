import { register } from "@main/ipc";
import { requireAdmin } from "@main/session";
import { prisma } from "@main/db";

register("audit:list", async (p: {
  userId?: string;
  action?: string;
  entityType?: string;
  from?: string;  // ISO date string
  to?: string;    // ISO date string
  page: number;
  pageSize: number;
}) => {
  requireAdmin();
  const where: any = {};
  if (p.userId) where.userId = p.userId;
  if (p.action) where.action = p.action;
  if (p.entityType) where.targetEntity = p.entityType;
  if (p.from || p.to) where.timestamp = {};
  if (p.from) where.timestamp.gte = new Date(p.from);
  if (p.to)   where.timestamp.lte = new Date(p.to);

  const [rows, total] = await Promise.all([
    prisma().auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, username: true } } },
      orderBy: { timestamp: "desc" },
      skip: Math.max(0, (p.page - 1) * p.pageSize),
      take: Math.min(200, Math.max(1, p.pageSize)),
    }),
    prisma().auditLog.count({ where }),
  ]);
  return { rows, total };
});

register("audit:distinctActions", async () => {
  requireAdmin();
  const rows = await prisma().auditLog.findMany({
    select: { action: true },
    distinct: ["action"],
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
});

export {};
