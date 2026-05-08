import { register } from "@main/ipc";
import { requireAdmin } from "@main/session";
import {
  listUsers,
  createUserAdmin,
  resetUserPassword,
  setUserActive,
  updateUserRole,
  deleteUser
} from "@main/services/users.service";
import type { Role } from "@lab/types";

register("users:list", async () => {
  requireAdmin();
  return listUsers();
});

register("users:create", async (p: { name: string; username: string; password: string; role: Role }) => {
  requireAdmin();
  return createUserAdmin(p);
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
