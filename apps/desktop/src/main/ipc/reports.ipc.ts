import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireSession } from "@main/session";
import { buildReportData } from "@main/services/report.service";
import { renderReportPdf } from "@main/services/pdf.service";
import { printPdfBuffer } from "@main/services/print.service";
import { audit } from "@main/services/audit.service";
import { validate, type TemplateConfig } from "@shared/template-config";
import { app } from "electron";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

register("reports:listReady", async () => {
  requireSession();
  const visits = await prisma().visit.findMany({
    where: { status: "Completed", deletedAt: null },
    include: { patient: true, visitTests: { include: { test: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100
  });
  return visits;
});

async function pdfPath(visitId: string): Promise<string> {
  const dir = join(app.getPath("userData"), "reports");
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  return join(dir, `${visitId}.pdf`);
}

// Resolve which template's config to use for this print/preview.
// Priority: explicit templateId in payload (per-print override) > lab default >
// any template marked isDefault > fail.
async function resolveTemplateConfig(templateId?: string): Promise<TemplateConfig> {
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

register("reports:generatePdf", async ({ visitId, templateId }: { visitId: string; templateId?: string }) => {
  requireSession();
  const data = await buildReportData(visitId);
  const config = await resolveTemplateConfig(templateId);
  const buffer = await renderReportPdf(data, config);
  const path = await pdfPath(visitId);
  await writeFile(path, buffer);
  await audit("GENERATE_PDF", "Visit", visitId);
  return { path, base64: buffer.toString("base64") };
});

register("reports:print", async ({ visitId, templateId }: { visitId: string; templateId?: string }) => {
  requireSession();
  const data = await buildReportData(visitId);
  const config = await resolveTemplateConfig(templateId);
  const buffer = await renderReportPdf(data, config);
  await printPdfBuffer(buffer);
  await audit("PRINT", "Visit", visitId);
  return true;
});
