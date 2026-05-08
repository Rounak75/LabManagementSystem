import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { hashRecoveryCode } from "../recovery-code";

type FakeUser = {
  id: string;
  username: string;
  name: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  recoveryCodeHash: string | null;
};

type FakeAuditLog = {
  id: string;
  userId: string;
  action: string;
  targetEntity: string;
  targetId: string;
};

const users: FakeUser[] = [];
const auditLogs: FakeAuditLog[] = [];
let auditCounter = 0;

const fakePrisma = {
  user: {
    findUnique: async ({ where }: any) => {
      if (where.username) return users.find((u) => u.username === where.username) ?? null;
      if (where.id) return users.find((u) => u.id === where.id) ?? null;
      return null;
    },
    update: async ({ where, data }: any) => {
      const user = users.find((u) => u.id === where.id);
      if (!user) throw new Error("not found");
      Object.assign(user, data);
      return user;
    }
  },
  auditLog: {
    create: async ({ data }: any) => {
      const row = { id: `audit-${++auditCounter}`, ...data };
      auditLogs.push(row);
      return row;
    }
  },
  $transaction: async (ops: any[]) => Promise.all(ops)
};

vi.mock("@main/db", () => ({ prisma: () => fakePrisma }));

import { recoverPassword } from "../auth.service";

async function seedAdminUser(opts: { recoveryCode: string; password?: string }) {
  const passwordHash = await bcrypt.hash(opts.password ?? "old-password", 4);
  const recoveryCodeHash = await hashRecoveryCode(opts.recoveryCode);
  const user: FakeUser = {
    id: "user-1",
    username: "admin",
    name: "Admin",
    passwordHash,
    role: "Admin",
    isActive: true,
    recoveryCodeHash
  };
  users.push(user);
  return user;
}

describe("recoverPassword", () => {
  beforeEach(() => {
    users.length = 0;
    auditLogs.length = 0;
    auditCounter = 0;
  });

  it("rotates the password and recovery code on success", async () => {
    const oldCode = "ABCDEFGH12345678";
    const user = await seedAdminUser({ recoveryCode: oldCode });
    const oldPasswordHash = user.passwordHash;
    const oldRecoveryCodeHash = user.recoveryCodeHash;

    const result = await recoverPassword({
      username: "admin",
      recoveryCode: oldCode,
      newPassword: "brand-new-password"
    });

    expect(result.newRecoveryCode).toMatch(/^[A-Z0-9]{16}$/);
    expect(result.newRecoveryCode).not.toBe(oldCode);

    const updated = users.find((u) => u.id === user.id)!;
    expect(await bcrypt.compare("brand-new-password", updated.passwordHash)).toBe(true);
    expect(updated.passwordHash).not.toBe(oldPasswordHash);
    expect(updated.recoveryCodeHash).not.toBe(oldRecoveryCodeHash);
    expect(await bcrypt.compare(result.newRecoveryCode, updated.recoveryCodeHash!)).toBe(true);

    const log = auditLogs.find((l) => l.action === "PASSWORD_RECOVERED");
    expect(log).toBeDefined();
    expect(log!.userId).toBe(user.id);
    expect(log!.targetEntity).toBe("User");
    expect(log!.targetId).toBe(user.id);
  });

  it("accepts a hyphenated, lowercase recovery code", async () => {
    const code = "ABCDEFGH12345678";
    await seedAdminUser({ recoveryCode: code });

    const result = await recoverPassword({
      username: "admin",
      recoveryCode: "abcd-efgh-1234-5678",
      newPassword: "another-new-password"
    });
    expect(result.newRecoveryCode).toMatch(/^[A-Z0-9]{16}$/);
  });

  it("throws INVALID_RECOVERY_CODE when the code is wrong", async () => {
    await seedAdminUser({ recoveryCode: "ABCDEFGH12345678" });

    await expect(
      recoverPassword({
        username: "admin",
        recoveryCode: "WRONGCODEWRONG12",
        newPassword: "doesnt-matter"
      })
    ).rejects.toThrow("INVALID_RECOVERY_CODE");
  });

  it("throws INVALID_RECOVERY_CODE when the username is unknown (no leak)", async () => {
    await expect(
      recoverPassword({
        username: "ghost",
        recoveryCode: "ABCDEFGH12345678",
        newPassword: "doesnt-matter"
      })
    ).rejects.toThrow("INVALID_RECOVERY_CODE");
  });
});
