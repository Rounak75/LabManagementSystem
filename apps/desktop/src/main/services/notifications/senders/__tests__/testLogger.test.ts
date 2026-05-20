import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

vi.mock("electron", () => ({
  app: { getPath: (_k: string) => os.tmpdir() },
}));

import { send } from "../test-logger";

const sample = {
  id: "n1",
  channel: "SMS",
  recipient: "98xxx12345",
  payload: "Hello test",
  purpose: "ReportReady",
  subject: null,
};

describe("test-logger sender", () => {
  beforeEach(() => {
    const logPath = path.join(os.tmpdir(), "notifications-test.log");
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  });

  it("appends an entry and returns ok", async () => {
    const res = await send(sample);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.messageId).toMatch(/^test-/);
      expect(res.payload).toBe("Hello test");
    }
    const log = fs.readFileSync(path.join(os.tmpdir(), "notifications-test.log"), "utf8");
    expect(log).toContain("98xxx12345");
    expect(log).toContain("ReportReady");
  });
});
