import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  auditLogCreate: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@main/db", () => ({
  prisma: () => ({ auditLog: { create: mocks.auditLogCreate } }),
}));
vi.mock("@main/session", () => ({ getSession: mocks.getSession }));

import { audit } from "../audit.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditLogCreate.mockResolvedValue({ id: "log-1" });
});

describe("audit", () => {
  it("attributes the entry to the signed-in user", async () => {
    mocks.getSession.mockReturnValue({ id: "u-session" });

    await audit("visit.create", "Visit", "v1");

    expect(mocks.auditLogCreate).toHaveBeenCalledOnce();
    expect(mocks.auditLogCreate.mock.calls[0]![0].data.userId).toBe("u-session");
  });

  it("does nothing when there is no session and no explicit actor", async () => {
    mocks.getSession.mockReturnValue(null);

    await audit("visit.create", "Visit", "v1");

    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  // Background workers (cloud sync, schedulers) run with no signed-in user, but
  // still need an audit trail — otherwise security-relevant events they detect
  // are dropped silently.
  it("accepts an explicit actor so background workers can write an audit trail", async () => {
    mocks.getSession.mockReturnValue(null);

    await audit("result.locked_write_rejected", "TestResult", "r1", "{}", "u-from-cloud");

    expect(mocks.auditLogCreate).toHaveBeenCalledOnce();
    expect(mocks.auditLogCreate.mock.calls[0]![0].data.userId).toBe("u-from-cloud");
  });

  it("prefers the explicit actor over the session user", async () => {
    mocks.getSession.mockReturnValue({ id: "u-session" });

    await audit("result.locked_write_rejected", "TestResult", "r1", "{}", "u-explicit");

    expect(mocks.auditLogCreate.mock.calls[0]![0].data.userId).toBe("u-explicit");
  });
});
