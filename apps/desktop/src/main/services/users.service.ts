import { prisma } from "@main/db";
import type { Role } from "@lab/types";
import { hashPassword } from "./auth.service";
import { audit } from "./audit.service";

export interface UserRow {
  id: string;
  name: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function listUsers(): Promise<UserRow[]> {
  return prisma().user.findMany({
    select: { id: true, name: true, username: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" }
  });
}

export async function createUserAdmin(p: { name: string; username: string; password: string; role: Role }) {
  const passwordHash = await hashPassword(p.password);
  const u = await prisma().user.create({
    data: { name: p.name, username: p.username, role: p.role, passwordHash, isActive: true }
  });
  await audit("USER_CREATED", "User", u.id, JSON.stringify({ role: p.role }));
  return { id: u.id, name: u.name, username: u.username, role: u.role as Role, isActive: u.isActive };
}

export async function resetUserPassword(p: { id: string; newPassword: string }) {
  const passwordHash = await hashPassword(p.newPassword);
  await prisma().user.update({ where: { id: p.id }, data: { passwordHash } });
  await audit("USER_PASSWORD_RESET", "User", p.id);
  return { ok: true as const };
}

export async function setUserActive(p: { id: string; isActive: boolean }) {
  if (!p.isActive) {
    const target = await prisma().user.findUnique({ where: { id: p.id } });
    if (!target) throw new Error("NOT_FOUND");
    if (target.role === "Admin" && target.isActive) {
      const count = await prisma().user.count({ where: { role: "Admin", isActive: true } });
      if (count <= 1) throw new Error("ADMIN_LOCKOUT_PROTECTED");
    }
  }
  await prisma().user.update({ where: { id: p.id }, data: { isActive: p.isActive } });
  await audit(p.isActive ? "USER_ENABLED" : "USER_DISABLED", "User", p.id);
  return { ok: true as const };
}

export async function updateUserRole(p: { id: string; role: Role }) {
  const target = await prisma().user.findUnique({ where: { id: p.id } });
  if (!target) throw new Error("NOT_FOUND");
  if (target.role === "Admin" && p.role === "Staff" && target.isActive) {
    const count = await prisma().user.count({ where: { role: "Admin", isActive: true } });
    if (count <= 1) throw new Error("ADMIN_LOCKOUT_PROTECTED");
  }
  await prisma().user.update({ where: { id: p.id }, data: { role: p.role } });
  await audit("USER_ROLE_CHANGED", "User", p.id, JSON.stringify({ role: p.role }));
  return { ok: true as const };
}

export async function deleteUser(p: { id: string }) {
  const target = await prisma().user.findUnique({ where: { id: p.id } });
  if (!target) throw new Error("NOT_FOUND");
  if (target.role === "Admin" && target.isActive) {
    const count = await prisma().user.count({ where: { role: "Admin", isActive: true } });
    if (count <= 1) throw new Error("ADMIN_LOCKOUT_PROTECTED");
  }
  const auditCount = await prisma().auditLog.count({ where: { userId: p.id } });
  if (auditCount > 0) throw new Error("USER_HAS_HISTORY");
  await prisma().user.delete({ where: { id: p.id } });
  await audit("USER_DELETED", "User", p.id);
  return { ok: true as const };
}
