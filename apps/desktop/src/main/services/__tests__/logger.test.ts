import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";

let tempDir: string;
tempDir = fs.mkdtempSync(join(os.tmpdir(), "lab-logger-test-"));

vi.mock("electron", () => ({
  app: { getPath: () => tempDir, isPackaged: false },
}));

import { logError, logFilePath, __resetLoggerForTests } from "../logger";

beforeEach(() => {
  for (const f of fs.readdirSync(tempDir)) fs.rmSync(join(tempDir, f), { force: true });
  __resetLoggerForTests();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("logError", () => {
  it("writes a timestamped line with scope and message to the log file", () => {
    logError("test-scope", new Error("boom"));
    const text = fs.readFileSync(logFilePath(), "utf8");
    expect(text).toContain("test-scope");
    expect(text).toContain("boom");
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("accepts a string error", () => {
    logError("scope2", "plain string error");
    expect(fs.readFileSync(logFilePath(), "utf8")).toContain("plain string error");
  });

  it("never throws even if the error has no message", () => {
    expect(() => logError("scope3", undefined)).not.toThrow();
  });

  it("rotates when the file exceeds the size cap", () => {
    const big = "x".repeat(1024);
    for (let i = 0; i < 2200; i++) logError("rot", big);
    expect(fs.existsSync(logFilePath() + ".1")).toBe(true);
    // retention cap: keep 3 files (.log, .1, .2) — .3 must never exist
    expect(fs.existsSync(logFilePath() + ".3")).toBe(false);
  });
});
