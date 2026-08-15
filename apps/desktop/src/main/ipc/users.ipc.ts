import { register } from "@main/ipc";
import { requireAdmin } from "@main/session";
import {
  listUsers,
  createUserAdmin,
  resetUserPassword,
  setUserActive,
  updateUserRole,
  deleteUser,
  setUserCanCollectSamples,
} from "@main/services/users.service";
import type { Role } from "@lab/types";
import type { UserRow } from "@shared/api";

/**
 * Convert a stored user into the wire shape the renderer is promised.
 *
 * Both conversions are what the seam already did invisibly: `stripNonCloneable`
 * JSON round-trips the reply, and `JSON.stringify` renders a `Date` through
 * `toISOString`. Doing it here changes no value — it just makes the type the
 * renderer sees match the value it actually receives.
 */
function toUserRow(row: {
  id: string; name: string; username: string; role: string;
  isActive: boolean; canCollectSamples: boolean; createdAt: Date; updatedAt: Date;
}): UserRow {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role as Role,
    isActive: row.isActive,
    canCollectSamples: row.canCollectSamples,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

register("users:list", async () => {
  requireAdmin();
  return (await listUsers()).map(toUserRow);
});

register("users:create", async (p: {
  name: string; username: string; password: string; role: Role;
  canCollectSamples?: boolean;
}) => {
  requireAdmin();
  return createUserAdmin(p);
});

register("users:setCanCollectSamples", async (p: { id: string; canCollectSamples: boolean }) => {
  requireAdmin();
  return setUserCanCollectSamples(p);
});

register("users:resetPassword", async (p: { id: string; newPassword: string }) => {
  requireAdmin();
  return resetUserPassword(p);
});

register("users:setActive", async (p: { id: string; isActive: boolean }) => {
  requireAdmin();
  return setUserActive(p);
});

register("users:updateRole", async (p: { id: string; role: Role }) => {
  requireAdmin();
  return updateUserRole(p);
});

register("users:delete", async (p: { id: string }) => {
  requireAdmin();
  return deleteUser(p);
});
