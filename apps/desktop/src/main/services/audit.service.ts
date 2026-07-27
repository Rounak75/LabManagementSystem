import { prisma } from "@main/db";
import { getSession } from "@main/session";

/**
 * Records an audit entry, attributed to the signed-in user.
 *
 * `actorId` overrides the session and exists for background workers (cloud sync,
 * schedulers) that have no signed-in user: without it they cannot write an audit
 * trail at all, so security-relevant events they detect — a rejected write to a
 * locked result, for instance — would be dropped silently.
 */
export async function audit(
  action: string,
  targetEntity: string,
  targetId: string,
  details?: string,
  actorId?: string,
) {
  const userId = actorId ?? getSession()?.id;
  if (!userId) return;
  await prisma().auditLog.create({
    data: { userId, action, targetEntity, targetId, details: details ?? null }
  });
}
