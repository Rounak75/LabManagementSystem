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

  // The fatal-error dialog tells the owner to send this file to support, and
  // Prisma errors embed the values from the failing query — so patient names,
  // phone numbers and result values were landing in a plaintext file that the app
  // actively encourages emailing off the premises.
  describe("PII redaction", () => {
    it("redacts a Prisma error's argument values", () => {
      logError(
        "db",
        new Error(
          'Invalid `prisma.patient.create()` invocation: { name: "Sunita Devi", phone: "9876543210" }',
        ),
      );

      const text = fs.readFileSync(logFilePath(), "utf8");
      expect(text).not.toContain("Sunita Devi");
      expect(text).not.toContain("9876543210");
    });

    it("still records what failed and where", () => {
      logError("db", new Error('prisma.patient.create() failed: { name: "Sunita Devi" }'));

      const text = fs.readFileSync(logFilePath(), "utf8");
      expect(text).toContain("db");
      expect(text).toContain("prisma.patient.create()");
      expect(text).toContain("[redacted]");
    });

    it("redacts a bare 10-digit phone number", () => {
      logError("sms", "failed to send to 9876543210");
      expect(fs.readFileSync(logFilePath(), "utf8")).not.toContain("9876543210");
    });

    it("redacts email addresses", () => {
      logError("mail", "smtp rejected recipient sunita@example.com");
      const text = fs.readFileSync(logFilePath(), "utf8");
      expect(text).not.toContain("sunita@example.com");
    });

    it("leaves a stack trace's file paths and line numbers intact", () => {
      const err = new Error("boom");
      err.stack = "Error: boom\n    at initDatabase (/app/out/main/index.js:385:5)";

      logError("boot", err);

      const text = fs.readFileSync(logFilePath(), "utf8");
      expect(text).toContain("index.js:385:5");
      expect(text).toContain("initDatabase");
    });
  });

  it("rotates when the file exceeds the size cap", () => {
    const big = "x".repeat(1024);
    for (let i = 0; i < 2200; i++) logError("rot", big);
    expect(fs.existsSync(logFilePath() + ".1")).toBe(true);
    // retention cap: keep 3 files (.log, .1, .2) — .3 must never exist
    expect(fs.existsSync(logFilePath() + ".3")).toBe(false);
  });
});
