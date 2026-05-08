import { register } from "@main/ipc";
import { setSession, getSession } from "@main/session";
import { authenticate, isFirstRun, hashPassword, recoverPassword } from "@main/services/auth.service";
import { generateRecoveryCode, hashRecoveryCode } from "@main/services/recovery-code";
import { prisma } from "@main/db";
import type { FirstRunInput, LoginInput } from "@shared/api";
import { audit } from "@main/services/audit.service";
import type { Role } from "@lab/types";

register("auth:firstRunNeeded", async () => {
  const result = await isFirstRun();
  console.log("[AUTH] firstRunNeeded called, result:", result);
  return result;
});

register("auth:firstRunComplete", async (payload: FirstRunInput) => {
  console.log("[AUTH] firstRunComplete called with admin:", payload.admin?.username);
  console.log("[AUTH] DATABASE_URL:", process.env.DATABASE_URL);
  // Use an interactive transaction so user + settings are created atomically.
  // If anything fails, the entire operation rolls back.
  const result = await prisma().$transaction(async (tx) => {
    const userCount = await tx.user.count();
    console.log("[AUTH] user count in transaction:", userCount);
    if (userCount > 0) throw new Error("FORBIDDEN");

    const passwordHash = await hashPassword(payload.admin.password);
    const user = await tx.user.create({
      data: {
        name: payload.admin.name,
        username: payload.admin.username,
        passwordHash,
        role: "Admin" as Role,
        isActive: true
      }
    });

    const recoveryCode = generateRecoveryCode();
    const recoveryCodeHash = await hashRecoveryCode(recoveryCode);
    await tx.user.update({
      where: { id: user.id },
      data: { recoveryCodeHash }
    });

    await tx.labSettings.upsert({
      where: { id: "singleton" },
      update: { ...payload.settings },
      create: {
        id: "singleton",
        ...payload.settings,
        labName: payload.settings.labName,
        labAddress: payload.settings.labAddress,
        labPhone: payload.settings.labPhone,
        morningOpenTime: payload.settings.morningOpenTime,
        morningCloseTime: payload.settings.morningCloseTime,
        childAgeBoundary: payload.settings.childAgeBoundary
      }
    });

    return {
      user: { id: user.id, username: user.username, name: user.name, role: user.role as Role },
      recoveryCode
    };
  });

  setSession(result.user);
  await audit("FIRST_RUN_COMPLETE", "User", result.user.id);
  return result;
});

register("auth:login", async (payload: LoginInput) => {
  const u = await authenticate(payload.username, payload.password);
  setSession(u);
  await audit("LOGIN", "User", u.id);
  return u;
});

register("auth:logout", async () => {
  const u = getSession();
  if (u) await audit("LOGOUT", "User", u.id);
  setSession(null);
  return true;
});

register("auth:currentUser", async () => getSession());

register("auth:recoverPassword", async (payload: { username: string; recoveryCode: string; newPassword: string }) => {
  return recoverPassword(payload);
});
