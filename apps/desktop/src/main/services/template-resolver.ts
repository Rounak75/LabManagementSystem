import { prisma } from "@main/db";
import { validate, type TemplateConfig } from "@shared/template-config";

/**
 * Which template's styling a report is printed with.
 *
 * Priority: an explicit per-print override, then the lab's configured default,
 * then any template flagged as default, then fail. Shared by the interactive
 * print/preview path and the print queue so a report queued from a phone comes
 * out looking exactly like one printed at the desk — the alternative is the same
 * rule written twice and drifting.
 */
export async function resolveTemplateConfig(templateId?: string): Promise<TemplateConfig> {
  let tpl: { config: string } | null = null;
  if (templateId) {
    tpl = await prisma().reportTemplate.findUnique({ where: { id: templateId } });
  }
  if (!tpl) {
    const settings = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
    if (settings?.defaultTemplateId) {
      tpl = await prisma().reportTemplate.findUnique({ where: { id: settings.defaultTemplateId } });
    }
  }
  if (!tpl) {
    tpl = await prisma().reportTemplate.findFirst({ where: { isDefault: true } });
  }
  if (!tpl) throw new Error("NO_TEMPLATE");
  const parsed = JSON.parse(tpl.config);
  const v = validate(parsed);
  if (!v.ok) throw new Error("INVALID_TEMPLATE_CONFIG");
  return v.value;
}
