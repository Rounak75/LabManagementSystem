import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireSession } from "@main/session";
import { buildReportData } from "@main/services/report.service";
import { renderReportPdf } from "@main/services/pdf.service";
import { printPdfBuffer } from "@main/services/print.service";
import { resolveTemplateConfig } from "@main/services/template-resolver";
import { audit } from "@main/services/audit.service";
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
