import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrateLogoToDataUri } from "../report.service";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("migrateLogoToDataUri", () => {
  let tmpFile: string;
  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `logo-${Date.now()}-${Math.random()}.png`);
    fs.writeFileSync(tmpFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
  afterEach(() => { try { fs.unlinkSync(tmpFile); } catch {} });

  it("returns null if input is null", () => {
    expect(migrateLogoToDataUri(null)).toBeNull();
  });

  it("passes through an existing data URI unchanged", () => {
    const input = "data:image/png;base64,iVBORw==";
    expect(migrateLogoToDataUri(input)).toBe(input);
  });

  it("converts a file path to a base64 data URI", () => {
    const out = migrateLogoToDataUri(tmpFile);
    expect(out).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
  });

  it("returns null when the file does not exist", () => {
    expect(migrateLogoToDataUri("/nonexistent/xyz.png")).toBeNull();
  });

  it("uses image/jpeg mime for .jpg files", () => {
    const jpg = path.join(os.tmpdir(), `logo-${Date.now()}.jpg`);
    fs.writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff]));
    try {
      expect(migrateLogoToDataUri(jpg)).toMatch(/^data:image\/jpeg;base64,/);
    } finally { fs.unlinkSync(jpg); }
  });
});
