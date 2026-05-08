import { prisma } from "@main/db";
import { getSession } from "@main/session";

export async function audit(action: string, targetEntity: string, targetId: string, details?: string) {
  const u = getSession();
  if (!u) return;
  await prisma().auditLog.create({
    data: { userId: u.id, action, targetEntity, targetId, details: details ?? null }
  });
}
