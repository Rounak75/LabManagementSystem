import { prisma } from "@main/db";

export async function setDefaultAtomic(id: string): Promise<void> {
  await prisma().$transaction([
    prisma().reportTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    prisma().reportTemplate.update({ where: { id }, data: { isDefault: true } }),
    prisma().labSettings.update({ where: { id: "singleton" }, data: { defaultTemplateId: id } }),
  ]);
}
