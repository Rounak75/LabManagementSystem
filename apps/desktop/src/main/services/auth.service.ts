import bcrypt from "bcryptjs";
import { prisma } from "@main/db";
import type { Role, SessionUser } from "@lab/types";
import { generateRecoveryCode, hashRecoveryCode, verifyRecoveryCode } from "./recovery-code";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

export async function authenticate(username: string, password: string): Promise<SessionUser> {
  const user = await prisma().user.findUnique({ where: { username } });
  if (!user || !user.isActive) throw new Error("INVALID_CREDENTIALS");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("INVALID_CREDENTIALS");
  return { id: user.id, username: user.username, name: user.name, role: user.role as Role };
}

export async function isFirstRun(): Promise<boolean> {
  const count = await prisma().user.count();
  return count === 0;
}

export async function recoverPassword(input: {
  username: string;
  recoveryCode: string;
  newPassword: string;
}): Promise<{ newRecoveryCode: string }> {
  const user = await prisma().user.findUnique({ where: { username: input.username } });
  if (!user || !user.recoveryCodeHash) throw new Error("INVALID_RECOVERY_CODE");

  const cleanCode = input.recoveryCode.replace(/-/g, "").toUpperCase();
  const ok = await verifyRecoveryCode(cleanCode, user.recoveryCodeHash);
  if (!ok) throw new Error("INVALID_RECOVERY_CODE");

  const newCode = generateRecoveryCode();
  const newHash = await hashRecoveryCode(newCode);
  const newPasswordHash = await hashPassword(input.newPassword);

  await prisma().$transaction([
    prisma().user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash, recoveryCodeHash: newHash }
    }),
    prisma().auditLog.create({
      data: {
        userId: user.id,
        action: "PASSWORD_RECOVERED",
        targetEntity: "User",
        targetId: user.id
      }
    })
  ]);

  return { newRecoveryCode: newCode };
}

export async function createUser(args: { name: string; username: string; password: string; role: Role; }): Promise<SessionUser> {
  const exists = await prisma().user.findUnique({ where: { username: args.username } });
  if (exists) throw new Error("DUPLICATE_USERNAME");
  const passwordHash = await hashPassword(args.password);
  const user = await prisma().user.create({
    data: { name: args.name, username: args.username, passwordHash, role: args.role, isActive: true }
  });
  return { id: user.id, username: user.username, name: user.name, role: user.role as Role };
}
