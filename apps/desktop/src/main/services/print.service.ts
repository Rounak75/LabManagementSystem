import { BrowserWindow } from "electron";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Sends a rendered report to the printer.
 *
 * `silent` decides whether Windows' print dialog opens first. It must be false
 * when someone is sitting at the machine and clicked Print — they may want a
 * different tray or printer — and true for a queued job, where the dialog would
 * be a modal box on an unattended PC that nobody is there to dismiss, stalling
 * every job behind it.
 */
export async function printPdfBuffer(
  buffer: Buffer,
  opts: { silent?: boolean } = {},
): Promise<void> {
  const tmpPath = join(tmpdir(), `lab-report-${Date.now()}.pdf`);
  await writeFile(tmpPath, buffer);

  const win = new BrowserWindow({ show: false, webPreferences: { plugins: true } });
  await win.loadURL(`file://${tmpPath}`);
  await new Promise<void>((resolve, reject) => {
    win.webContents.print(
      { silent: opts.silent ?? false, printBackground: true },
      (success, errorType) => {
        win.destroy();
        // "cancelled" only happens when a human dismissed the dialog, which is a
        // decision, not a failure. A silent print has no dialog to cancel.
        if (success || errorType === "cancelled") resolve();
        else reject(new Error(`Print failed: ${errorType}`));
      },
    );
  });
}
