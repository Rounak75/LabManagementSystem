import { BrowserWindow } from "electron";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export async function printPdfBuffer(buffer: Buffer): Promise<void> {
  const tmpPath = join(tmpdir(), `lab-report-${Date.now()}.pdf`);
  await writeFile(tmpPath, buffer);

  const win = new BrowserWindow({ show: false, webPreferences: { plugins: true } });
  await win.loadURL(`file://${tmpPath}`);
  await new Promise<void>((resolve, reject) => {
    win.webContents.print({ silent: false, printBackground: true }, (success, errorType) => {
      win.destroy();
      if (success || errorType === "cancelled") resolve();
      else reject(new Error(`Print failed: ${errorType}`));
    });
  });
}
