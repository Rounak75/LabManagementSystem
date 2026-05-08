import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireAdmin, requireSession } from "@main/session";
import { audit } from "@main/services/audit.service";
import { validate, type TemplateConfig } from "@shared/template-config";
import { setDefaultAtomic } from "@main/services/template.service";

register("templates:list", async () => {
  // Read-only listing is needed by Reports preview (Staff-accessible) so
  // they can pick a template at print time. Mutations below remain Admin-only.
  requireSession();
  return prisma().reportTemplate.findMany({ orderBy: { updatedAt: "desc" } });
});

register("templates:save", async (p: { id?: string; name: string; config: TemplateConfig }) => {
  requireAdmin();
  const v = validate(p.config);
  if (!v.ok) throw new Error("INVALID_INPUT");
  const configString = JSON.stringify(v.value);
  if (p.id) {
    const updated = await prisma().reportTemplate.update({
      where: { id: p.id },
      data: { name: p.name, config: configString },
    });
    await audit("TEMPLATE_UPDATED", "ReportTemplate", p.id);
    return updated;
  }
  const created = await prisma().reportTemplate.create({
    data: { name: p.name, isDefault: false, config: configString },
  });
  await audit("TEMPLATE_CREATED", "ReportTemplate", created.id);
  return created;
});

register("templates:setDefault", async (p: { id: string }) => {
  requireAdmin();
  const t = await prisma().reportTemplate.findUnique({ where: { id: p.id } });
  if (!t) throw new Error("NOT_FOUND");
  await setDefaultAtomic(p.id);
  await audit("TEMPLATE_DEFAULT_SET", "ReportTemplate", p.id);
  return { ok: true };
});

register("templates:duplicate", async (p: { id: string }) => {
  requireAdmin();
  const src = await prisma().reportTemplate.findUnique({ where: { id: p.id } });
  if (!src) throw new Error("NOT_FOUND");
  const copy = await prisma().reportTemplate.create({
    data: { name: `${src.name} (copy)`, isDefault: false, config: src.config },
  });
  await audit("TEMPLATE_DUPLICATED", "ReportTemplate", copy.id, JSON.stringify({ from: src.id }));
  return copy;
});

register("templates:delete", async (p: { id: string }) => {
  requireAdmin();
  const t = await prisma().reportTemplate.findUnique({ where: { id: p.id } });
  if (!t) throw new Error("NOT_FOUND");
  if (t.isDefault) throw new Error("TEMPLATE_IN_USE");
  await prisma().reportTemplate.delete({ where: { id: p.id } });
  await audit("TEMPLATE_DELETED", "ReportTemplate", p.id);
  return { ok: true };
});
