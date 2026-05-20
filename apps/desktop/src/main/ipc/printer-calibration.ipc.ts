// Phase 3d Plan B — IPC for letterhead calibration and the alignment-test print.
// All channels are Admin-only.

import { BrowserWindow } from "electron";
import { register } from "@main/ipc";
import { requireAdmin } from "@main/session";
import {
  getCalibration,
  upsertCalibration,
  listAllCalibrations,
} from "@main/services/printer-calibration.service";
import { LabReport } from "@lab/reports";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { printPdfBuffer } from "@main/services/print.service";
import { prisma } from "@main/db";
import React from "react";

register("printerCalibration:list", async () => {
  requireAdmin();
  return listAllCalibrations();
});

register("printerCalibration:upsert", async ({
  printerName,
  xOffsetMm,
  yOffsetMm,
}: {
  printerName: string;
  xOffsetMm: number;
  yOffsetMm: number;
}) => {
  requireAdmin();
  if (!printerName?.trim()) throw new Error("INVALID_INPUT");
  await upsertCalibration(printerName, { xOffsetMm, yOffsetMm });
  return { ok: true };
});

register("printerCalibration:listSystemPrinters", async () => {
  requireAdmin();
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, isDefault: p.isDefault ?? false }));
});

register("print:alignmentTest", async ({ printerName }: { printerName: string }) => {
  requireAdmin();
  if (!printerName?.trim()) throw new Error("INVALID_INPUT");
  const calibration = await getCalibration(printerName);
  const settings = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  // Render a minimal LabReport in AlignmentTest mode — patient data is dummy
  // because the crosshairs aren't supposed to show real patient info.
  // LabReport renders a <Document> internally — cast satisfies renderToBuffer's
  // narrower type (react-pdf's types don't see through component composition).
  const buffer = await renderToBuffer(
    React.createElement(LabReport, {
      patient: {
        name: "Alignment Test", age: 0, sex: "Male",
        visitDate: new Date().toISOString(),
        visitIdDisplay: "ALIGN-TEST",
        referringDoctor: "Self",
        phone: "",
      },
      lab: {
        name: settings?.labName ?? "Lab",
        address: settings?.labAddress ?? "",
        phone: settings?.labPhone ?? "",
        timings: "",
        pathologist: {
          name: settings?.pathologistName ?? "",
          qualifications: settings?.pathologistQuals ?? "",
        },
      },
      groups: [],
      layout: "AlignmentTest",
      calibration,
    }) as unknown as ReactElement<DocumentProps>
  );
  await printPdfBuffer(buffer as Buffer);
  return { ok: true };
});
