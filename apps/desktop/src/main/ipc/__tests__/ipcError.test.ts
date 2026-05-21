import { describe, it, expect, vi } from "vitest";

const handlers = new Map<string, (...a: any[]) => any>();
vi.mock("electron", () => ({
  ipcMain: { handle: (ch: string, fn: any) => handlers.set(ch, fn) },
}));
const logged: unknown[] = [];
vi.mock("@main/services/logger", () => ({ logError: (_s: string, e: unknown) => logged.push(e) }));

import { register, attachIpc } from "../index";

describe("attachIpc error masking", () => {
  it("masks a raw thrown error as a generic message and logs it", async () => {
    register("dashboard:stats" as any, () => { throw new Error("SQLITE_ERROR: no such column secret_xyz"); });
    attachIpc();
    const res = await handlers.get("dashboard:stats")!({}, {});
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("INTERNAL_ERROR");
    expect(res.error.message).not.toContain("secret_xyz");
    expect(res.error.message).toContain("lab computer");
    expect(logged.length).toBeGreaterThan(0);
  });

  it("preserves a known error CODE and its friendly mapped message", async () => {
    register("patients:create" as any, () => { throw new Error("DUPLICATE_PHONE"); });
    attachIpc();
    const res = await handlers.get("patients:create")!({}, {});
    expect(res.error.code).toBe("DUPLICATE_PHONE");
    expect(res.error.message).toContain("phone number already exists");
  });
});
