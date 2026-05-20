import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { audit } from "../audit-best-effort";

// Stub electron.app.getPath to return a temp dir so we can read the audit-errors.log
vi.mock("electron", () => ({
  app: { getPath: () => os.tmpdir() }
}));

const logFile = path.join(os.tmpdir(), "audit-errors.log");
afterEach(() => {
  try {
    fs.unlinkSync(logFile);
  } catch {
    /* noop */
  }
});

describe("audit.try", () => {
  it("calls through to underlying audit when it succeeds", async () => {
    const spy = vi.fn().mockResolvedValue({ id: "log-1" });
    await audit.try(
      "X",
      { entityType: "T", entityId: "1", userId: "u", details: {} },
      spy
    );
    expect(spy).toHaveBeenCalled();
  });

  it("appends to audit-errors.log and does NOT throw when underlying fails", async () => {
    const spy = vi.fn().mockRejectedValue(new Error("DB locked"));
    await expect(
      audit.try(
        "X",
        { entityType: "T", entityId: "1", userId: "u", details: {} },
        spy
      )
    ).resolves.toBeUndefined();
    const contents = fs.readFileSync(logFile, "utf8");
    expect(contents).toMatch(/DB locked/);
    expect(contents).toMatch(/"action":"X"/);
  });
});
