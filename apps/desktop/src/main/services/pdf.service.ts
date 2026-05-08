import React from "react";
import type { ReportData } from "./report.service";
import type { TemplateConfig } from "@shared/template-config";

export async function renderReportPdf(data: ReportData, config: TemplateConfig): Promise<Buffer> {
  const [{ renderToStream }, { DefaultReportTemplate }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../../renderer/pdf/DefaultReportTemplate")
  ]);
  const stream = await renderToStream(React.createElement(DefaultReportTemplate as any, { data, config }) as any);
  const chunks: Buffer[] = [];
  return await new Promise((resolve, reject) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
