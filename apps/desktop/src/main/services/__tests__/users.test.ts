import { describe, it, expect, beforeEach, vi } from "vitest";

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
  details: string | null;
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
    findMany: async ({ orderBy }: any = {}) => {
      const sorted = [...users];
      if (orderBy?.createdAt === "asc") sorted.sort((a, b) => a.id.localeCompare(b.id));
      return sorted;
    },
    update: async ({ where, data }: any) => {
      const user = users.find((u) => u.id === where.id);
      if (!user) throw new Error("not found");
      Object.assign(user, data);
      return user;
    },
    create: async ({ data }: any) => {
      const user: FakeUser = {
        id: data.id ?? `u-${users.length + 1}`,
        username: data.username,
        name: data.name,
        passwordHash: data.passwordHash,
        role: data.role,
        isActive: data.isActive ?? true,
        recoveryCodeHash: null
      };
      users.push(user);
      return user;
    },
    delete: async ({ where }: any) => {
      const idx = users.findIndex((u) => u.id === where.id);
      if (idx === -1) throw new Error("not found");
      const [removed] = users.splice(idx, 1);
      return removed;
    },
    count: async ({ where }: any = {}) => {
      return users.filter((u) => {
        if (where?.role && u.role !== where.role) return false;
        if (where?.isActive !== undefined && u.isActive !== where.isActive) return false;
        return true;
      }).length;
    }
  },
  auditLog: {
    create: async ({ data }: any) => {
      const row: FakeAuditLog = {
        id: `audit-${++auditCounter}`,
        userId: data.userId,
        action: data.action,
        targetEntity: data.targetEntity,
        targetId: data.targetId,
        details: data.details ?? null
      };
      auditLogs.push(row);
      return row;
    },
    count: async ({ where }: any = {}) => {
      return auditLogs.filter((l) => (where?.userId ? l.userId === where.userId : true)).length;
    }
  },
  $transaction: async (ops: any[]) => Promise.all(ops)
};

vi.mock("@main/db", () => ({ prisma: () => fakePrisma }));

import { authenticate } from "../auth.service";
import { setSession } from "@main/session";
import {
  setUserActive,
  updateUserRole,
  deleteUser
} from "../users.service";
import bcrypt from "bcryptjs";

function seedAdmin(id: string, isActive = true): FakeUser {
  const u: FakeUser = {
    id,
    username: id,
    name: id,
    passwordHash: "$2a$04$abcdefghijklmnopqrstuv",
    role: "Admin",
    isActive,
    recoveryCodeHash: null
  };
  users.push(u);
  return u;
}

function seedStaff(id: string, isActive = true): FakeUser {
  const u: FakeUser = {
    id,
    username: id,
    name: id,
    passwordHash: "$2a$04$abcdefghijklmnopqrstuv",
    role: "Staff",
    isActive,
    recoveryCodeHash: null
  };
  users.push(u);
  return u;
}

beforeEach(() => {
  users.length = 0;
  auditLogs.length = 0;
  auditCounter = 0;
  // Set an actor session so audit() can write
  setSession({ id: "actor", username: "actor", name: "Actor", role: "Admin" });
});

describe("users.service self-lockout guard", () => {
  it("setActive(false) on the last active Admin throws ADMIN_LOCKOUT_PROTECTED", async () => {
    const a = seedAdmin("admin-1");
    await expect(setUserActive({ id: a.id, isActive: false })).rejects.toThrow(
      "ADMIN_LOCKOUT_PROTECTED"
    );
  });

  it("setActive(false) succeeds when there are two active Admins", async () => {
    const a1 = seedAdmin("admin-1");
    seedAdmin("admin-2");
    const result = await setUserActive({ id: a1.id, isActive: false });
    expect(result).toEqual({ ok: true });
    const after = users.find((u) => u.id === a1.id)!;
    expect(after.isActive).toBe(false);
  });

  it("updateRole demoting the last active Admin to Staff throws ADMIN_LOCKOUT_PROTECTED", async () => {
    const a = seedAdmin("admin-1");
    await expect(updateUserRole({ id: a.id, role: "Staff" })).rejects.toThrow(
      "ADMIN_LOCKOUT_PROTECTED"
    );
  });

  it("delete on the last active Admin throws ADMIN_LOCKOUT_PROTECTED", async () => {
    const a = seedAdmin("admin-1");
    await expect(deleteUser({ id: a.id })).rejects.toThrow("ADMIN_LOCKOUT_PROTECTED");
  });

  it("delete on a user with audit history throws USER_HAS_HISTORY", async () => {
    seedAdmin("admin-1"); // keep an extra admin so lockout guard passes
    const s = seedStaff("staff-1");
    auditLogs.push({
      id: "audit-pre",
      userId: s.id,
      action: "LOGIN",
      targetEntity: "User",
      targetId: s.id,
      details: null
    });
    await expect(deleteUser({ id: s.id })).rejects.toThrow("USER_HAS_HISTORY");
  });
});

describe("authenticate disabled-user rejection", () => {
  it("rejects a user whose isActive is false with INVALID_CREDENTIALS", async () => {
    const passwordHash = await bcrypt.hash("hunter2", 4);
    const u: FakeUser = {
      id: "u-1",
      username: "disabled-user",
      name: "Disabled",
      passwordHash,
      role: "Staff",
      isActive: false,
      recoveryCodeHash: null
    };
    users.push(u);
    await expect(authenticate("disabled-user", "hunter2")).rejects.toThrow("INVALID_CREDENTIALS");
  });
});
