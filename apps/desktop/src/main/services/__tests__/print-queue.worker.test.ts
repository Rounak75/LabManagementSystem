import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The print queue that makes the staff portal's Print button real.
 *
 * Tapping Print wrote a PrintJob and told the user "Queued for printing". The
 * desktop moved it to Picked and nothing else existed — no code rendered or
 * printed it, so the job sat at Picked forever while the portal claimed success.
 */

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "." },
  BrowserWindow: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  buildReportData: vi.fn(),
  renderReportPdf: vi.fn(),
  printPdfBuffer: vi.fn(),
  resolveTemplateConfig: vi.fn(),
  auditTry: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({ printJob: { findMany: mocks.findMany, update: mocks.update } }),
}));
vi.mock("@main/services/report.service", () => ({ buildReportData: mocks.buildReportData }));
vi.mock("@main/services/pdf.service", () => ({ renderReportPdf: mocks.renderReportPdf }));
vi.mock("@main/services/print.service", () => ({ printPdfBuffer: mocks.printPdfBuffer }));
vi.mock("@main/services/template-resolver", () => ({
  resolveTemplateConfig: mocks.resolveTemplateConfig,
}));
vi.mock("@main/services/audit-best-effort", () => ({ audit: { try: mocks.auditTry } }));

import { runPrintQueueTick, MAX_JOB_AGE_MS, MAX_JOBS_PER_TICK } from "../print-queue.worker";

function job(over: Record<string, unknown> = {}) {
  return {
    id: "pj1",
    visitId: "v1",
    requestedById: "admin-1",
    requestedAt: new Date(),
    status: "Picked",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([]);
  mocks.update.mockResolvedValue({});
  mocks.buildReportData.mockResolvedValue({});
  mocks.renderReportPdf.mockResolvedValue(Buffer.from("pdf"));
  mocks.printPdfBuffer.mockResolvedValue(undefined);
  mocks.resolveTemplateConfig.mockResolvedValue({});
  mocks.auditTry.mockResolvedValue(undefined);
});

describe("runPrintQueueTick", () => {
  it("does nothing when the queue is empty", async () => {
    expect(await runPrintQueueTick()).toEqual({ printed: 0, failed: 0, expired: 0 });
    expect(mocks.printPdfBuffer).not.toHaveBeenCalled();
  });

  it("prints a queued report and marks the job Done", async () => {
    mocks.findMany.mockResolvedValue([job()]);

    const stats = await runPrintQueueTick();

    expect(stats.printed).toBe(1);
    expect(mocks.buildReportData).toHaveBeenCalledWith("v1");
    const update = mocks.update.mock.calls[0]![0];
    expect(update.where).toEqual({ id: "pj1" });
    expect(update.data.status).toBe("Done");
    expect(update.data.errorMessage).toBeNull();
  });

  // A dialog on an unattended PC is a modal nobody is there to dismiss, and it
  // stalls every job behind it.
  it("prints silently, without opening the print dialog", async () => {
    mocks.findMany.mockResolvedValue([job()]);
    await runPrintQueueTick();
    expect(mocks.printPdfBuffer).toHaveBeenCalledWith(expect.anything(), { silent: true });
  });

  it("only claims jobs that were picked up", async () => {
    await runPrintQueueTick();
    expect(mocks.findMany.mock.calls[0]![0].where).toEqual({ status: "Picked" });
  });

  // Printing is not idempotent: a job that failed partway has already put paper
  // in the tray, so retrying produces a duplicate or a half report on top of a
  // good one.
  it("records why a print failed and does not retry it", async () => {
    mocks.findMany.mockResolvedValue([job()]);
    mocks.printPdfBuffer.mockRejectedValue(new Error("Print failed: no printer"));

    const stats = await runPrintQueueTick();

    expect(stats).toMatchObject({ printed: 0, failed: 1 });
    const data = mocks.update.mock.calls[0]![0].data;
    expect(data.status).toBe("Failed");
    expect(data.errorMessage).toContain("no printer");
  });

  it("keeps printing the rest of the batch after one job fails", async () => {
    mocks.findMany.mockResolvedValue([job(), job({ id: "pj2", visitId: "v2" })]);
    mocks.printPdfBuffer.mockRejectedValueOnce(new Error("jam")).mockResolvedValue(undefined);

    const stats = await runPrintQueueTick();

    expect(stats).toMatchObject({ printed: 1, failed: 1 });
  });

  // The lab PC can be off for days. Without this, turning it on after a holiday
  // would push every request made in that time to the printer at once.
  it("drops a job older than the age limit instead of printing it", async () => {
    mocks.findMany.mockResolvedValue([
      job({ requestedAt: new Date(Date.now() - MAX_JOB_AGE_MS - 60_000) }),
    ]);

    const stats = await runPrintQueueTick();

    expect(stats).toMatchObject({ printed: 0, expired: 1 });
    expect(mocks.printPdfBuffer).not.toHaveBeenCalled();
    const data = mocks.update.mock.calls[0]![0].data;
    expect(data.status).toBe("Failed");
    expect(data.errorMessage).toMatch(/expired/i);
  });

  it("still prints a job that is within the age limit", async () => {
    mocks.findMany.mockResolvedValue([
      job({ requestedAt: new Date(Date.now() - MAX_JOB_AGE_MS + 60_000) }),
    ]);
    expect((await runPrintQueueTick()).printed).toBe(1);
  });

  it("caps how many jobs one tick will print", async () => {
    await runPrintQueueTick();
    expect(mocks.findMany.mock.calls[0]![0].take).toBe(MAX_JOBS_PER_TICK);
  });

  // A printer is a single physical resource; two print windows racing it
  // interleave pages across reports.
  it("does not start a second pass while one is still running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    mocks.findMany.mockResolvedValue([job()]);
    mocks.printPdfBuffer.mockImplementation(() => gate);

    // The re-entrancy guard is set before the first await, so the second call
    // sees it without needing to yield.
    const first = runPrintQueueTick();
    const second = await runPrintQueueTick();

    expect(second).toEqual({ printed: 0, failed: 0, expired: 0 });
    release();
    await first;
    expect(mocks.printPdfBuffer).toHaveBeenCalledTimes(1);
  });
});
