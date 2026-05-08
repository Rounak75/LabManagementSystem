import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireAdmin, requireSession } from "@main/session";
import { audit } from "@main/services/audit.service";

register("tests:list", async () => {
  requireSession();
  return prisma().test.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { parameters: { orderBy: { displayOrder: "asc" } } }
  });
});

register("tests:get", async ({ id }: { id: string }) => {
  requireSession();
  const t = await prisma().test.findUnique({ where: { id }, include: { parameters: { orderBy: { displayOrder: "asc" } } } });
  if (!t) throw new Error("NOT_FOUND");
  return t;
});

register("tests:create", async (input: { name: string; category: string; price: number; isOutsourced: boolean }) => {
  requireAdmin();
  if (!input.name?.trim() || input.price < 0) throw new Error("INVALID_INPUT");
  const t = await prisma().test.create({ data: input });
  await audit("CREATE", "Test", t.id);
  return t;
});

register("tests:update", async (input: { id: string; name: string; category: string; price: number; isOutsourced: boolean; isActive: boolean }) => {
  requireAdmin();
  const { id, ...rest } = input;
  const t = await prisma().test.update({ where: { id }, data: rest });
  await audit("UPDATE", "Test", id);
  return t;
});

register("tests:remove", async ({ id }: { id: string }) => {
  requireAdmin();
  await prisma().test.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  await audit("DELETE", "Test", id);
  return true;
});

register("params:create", async (input: any) => {
  requireAdmin();
  const { testId, ...rest } = input;
  const p = await prisma().testParameter.create({ data: { testId, ...rest } });
  await audit("CREATE", "TestParameter", p.id);
  return p;
});

register("params:update", async (input: any) => {
  requireAdmin();
  const { id, ...rest } = input;
  const p = await prisma().testParameter.update({ where: { id }, data: rest });
  await audit("UPDATE", "TestParameter", id);
  return p;
});

register("params:remove", async ({ id }: { id: string }) => {
  requireAdmin();
  await prisma().testParameter.delete({ where: { id } });
  await audit("DELETE", "TestParameter", id);
  return true;
});
