import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireAdmin, requireSession } from "@main/session";
import { audit } from "@main/services/audit.service";

register("doctors:list", async () => {
  requireSession();
  return prisma().doctor.findMany({
    where: { deletedAt: null },
    orderBy: [{ id: "asc" }]
  });
});

register("doctors:create", async ({ name, clinic }: { name: string; clinic?: string }) => {
  requireAdmin();
  if (!name?.trim()) throw new Error("INVALID_INPUT");
  const d = await prisma().doctor.create({ data: { name: name.trim(), clinic: clinic?.trim() || null } });
  await audit("CREATE", "Doctor", d.id);
  return d;
});

register("doctors:update", async ({ id, name, clinic, isActive }: { id: string; name: string; clinic?: string; isActive: boolean }) => {
  requireAdmin();
  if (id === "doctor-self") throw new Error("FORBIDDEN");
  const d = await prisma().doctor.update({ where: { id }, data: { name: name.trim(), clinic: clinic?.trim() || null, isActive } });
  await audit("UPDATE", "Doctor", id);
  return d;
});

register("doctors:remove", async ({ id }: { id: string }) => {
  requireAdmin();
  if (id === "doctor-self") throw new Error("FORBIDDEN");
  await prisma().doctor.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await audit("DELETE", "Doctor", id);
  return true;
});
