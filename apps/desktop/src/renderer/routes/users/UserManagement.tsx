import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { call } from "@/lib/api";
import { useAuth } from "@/stores/auth.store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import type { Role } from "@lab/types";

type UserRow = {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  canCollectSamples: boolean;
  createdAt: string;
  updatedAt: string;
};

function friendlyError(err: unknown): string {
  const code = (err as any)?.code as string | undefined;
  const message = (err as any)?.message as string | undefined;
  switch (code ?? message) {
    case "ADMIN_LOCKOUT_PROTECTED":
      return "You can't disable yourself while you're the only Admin.";
    case "USER_HAS_HISTORY":
      return "This user has activity in the audit log — disable them instead of deleting.";
    case "DUPLICATE_USERNAME":
      return "That username is already taken.";
    case "NOT_FOUND":
      return "User not found.";
    default:
      return message ?? "Something went wrong.";
  }
}

function formatDate(d: string): string {
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
}

export default function UserManagement() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => call<UserRow[]>("users:list")
  });

  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [togglingActive, setTogglingActive] = useState<UserRow | null>(null);
  const [changingRole, setChangingRole] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <Button onClick={() => setAdding(true)}>Add user</Button>
      </div>

      {pageError && (
        <div className="mb-3 rounded-md border border-danger/30 bg-red-50 p-3 text-sm text-danger">
          {pageError}
          <button className="ml-3 underline" onClick={() => setPageError(null)}>dismiss</button>
        </div>
      )}

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 text-slate-500">Loading…</div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">👤</div>
            <div className="text-lg font-medium text-slate-700 mb-1">No users yet</div>
            <div className="text-sm text-slate-500 max-w-xs">Click "Add user" to invite Staff or another Admin.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Collects samples</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isMe = me?.id === u.id;
                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-4 py-3">{u.name}{isMe && <span className="ml-2 text-xs text-slate-500">(you)</span>}</td>
                    <td className="px-4 py-3 text-slate-600">{u.username}</td>
                    <td className="px-4 py-3">{u.role}</td>
                    <td className="px-4 py-3">
                      <span className={u.isActive ? "text-emerald-700" : "text-slate-500"}>
                        {u.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <CanCollectToggle
                        user={u}
                        onError={(msg) => setPageError(msg)}
                        onDone={refresh}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setResetting(u)}>Reset password</Button>
                        <Button size="sm" variant="ghost" onClick={() => setChangingRole(u)}>Change role</Button>
                        {u.isActive ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isMe}
                            title={isMe ? "You can't disable yourself" : undefined}
                            onClick={() => setTogglingActive(u)}
                          >
                            Disable
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setTogglingActive(u)}>Enable</Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger hover:bg-red-50"
                          disabled={isMe}
                          title={isMe ? "You can't delete yourself" : undefined}
                          onClick={() => setDeleting(u)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {adding && (
        <AddUserModal
          onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); refresh(); }}
          onError={(msg) => setPageError(msg)}
        />
      )}
      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => { setResetting(null); refresh(); }}
          onError={(msg) => { setResetting(null); setPageError(msg); }}
        />
      )}
      {togglingActive && (
        <ToggleActiveModal
          user={togglingActive}
          onClose={() => setTogglingActive(null)}
          onDone={() => { setTogglingActive(null); refresh(); }}
          onError={(msg) => { setTogglingActive(null); setPageError(msg); }}
        />
      )}
      {changingRole && (
        <ChangeRoleModal
          user={changingRole}
          onClose={() => setChangingRole(null)}
          onDone={() => { setChangingRole(null); refresh(); }}
          onError={(msg) => { setChangingRole(null); setPageError(msg); }}
        />
      )}
      {deleting && (
        <DeleteUserModal
          user={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => { setDeleting(null); refresh(); }}
          onError={(msg) => { setDeleting(null); setPageError(msg); }}
        />
      )}
    </div>
  );
}

function AddUserModal({ onClose, onDone, onError }: { onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  type Form = { name: string; username: string; password: string; role: Role; canCollectSamples: boolean };
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    defaultValues: { name: "", username: "", password: "", role: "Staff", canCollectSamples: false }
  });
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (v: Form) => call("users:create", v),
    onSuccess: onDone,
    onError: (err) => setFormError(friendlyError(err))
  });
  return (
    <Modal open onClose={onClose} title="Add user">
      <form onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-3">
        <Input label="Full name" {...register("name", { required: true })} error={errors.name && "Required"} />
        <Input label="Username" {...register("username", { required: true })} error={errors.username && "Required"} />
        <Input label="Password" type="password" {...register("password", { required: true, minLength: 4 })} error={errors.password && "At least 4 characters"} />
        <Select label="Role" {...register("role")}>
          <option value="Staff">Staff</option>
          <option value="Admin">Admin</option>
        </Select>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" {...register("canCollectSamples")} className="mt-0.5" />
          <span>
            <span className="font-medium text-slate-700">Can collect samples</span>
            <span className="block text-xs text-slate-500">
              Show in the phlebotomist dropdown when approving home-visit bookings.
            </span>
          </span>
        </label>
        {formError && <p className="text-sm text-danger">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Add</Button>
        </div>
      </form>
    </Modal>
  );
  void onError; // page-level error not used here; we show inline
}

function CanCollectToggle({
  user,
  onError,
  onDone,
}: {
  user: UserRow;
  onError: (m: string) => void;
  onDone: () => void;
}) {
  const mut = useMutation({
    mutationFn: (v: boolean) =>
      call("users:setCanCollectSamples", { id: user.id, canCollectSamples: v }),
    onSuccess: onDone,
    onError: (err) => onError(friendlyError(err)),
  });
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={user.canCollectSamples}
        disabled={mut.isPending}
        onChange={(e) => mut.mutate(e.target.checked)}
      />
      <span className="text-xs text-slate-500">
        {user.canCollectSamples ? "Yes" : "No"}
      </span>
    </label>
  );
}

function ResetPasswordModal({ user, onClose, onDone, onError }: { user: UserRow; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{ newPassword: string; confirm: string }>({
    defaultValues: { newPassword: "", confirm: "" }
  });
  const [formError, setFormError] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: (v: { newPassword: string }) => call("users:resetPassword", { id: user.id, newPassword: v.newPassword }),
    onSuccess: onDone,
    onError: (err) => onError(friendlyError(err))
  });
  const pwd = watch("newPassword");
  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.name}`}>
      <form onSubmit={handleSubmit(v => {
        if (v.newPassword !== v.confirm) { setFormError("Passwords do not match"); return; }
        setFormError(null);
        reset.mutate({ newPassword: v.newPassword });
      })} className="space-y-3">
        <Input label="New password" type="password" {...register("newPassword", { required: true, minLength: 4 })} error={errors.newPassword && "At least 4 characters"} />
        <Input label="Confirm password" type="password" {...register("confirm", { required: true, validate: v => v === pwd || "Passwords do not match" })} error={errors.confirm?.message} />
        {formError && <p className="text-sm text-danger">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={reset.isPending}>Reset password</Button>
        </div>
      </form>
    </Modal>
  );
}

function ToggleActiveModal({ user, onClose, onDone, onError }: { user: UserRow; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const disabling = user.isActive;
  const [formError, setFormError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => call("users:setActive", { id: user.id, isActive: !user.isActive }),
    onSuccess: onDone,
    onError: (err) => setFormError(friendlyError(err))
  });
  // If we want to bubble, we can also onError → onError. We'll bubble after dismiss:
  const handleConfirm = () => mut.mutate();
  void onError;
  if (!disabling) {
    // Enabling — no destructive confirmation needed; do it on mount-style button click.
    return (
      <Modal open onClose={onClose} title={`Enable ${user.name}`}>
        <p className="text-sm text-slate-700">Re-enable this user? They will be able to log in again.</p>
        {formError && <p className="mt-3 text-sm text-danger">{formError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={mut.isPending}>Enable</Button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title={`Disable ${user.name}`}>
      <p className="text-sm text-slate-700">
        This user will no longer be able to log in. Their activity history is preserved.
      </p>
      {formError && <p className="mt-3 text-sm text-danger">{formError}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={handleConfirm} disabled={mut.isPending}>Disable</Button>
      </div>
    </Modal>
  );
}

function ChangeRoleModal({ user, onClose, onDone, onError }: { user: UserRow; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [role, setRole] = useState<Role>(user.role);
  const [formError, setFormError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => call("users:updateRole", { id: user.id, role }),
    onSuccess: onDone,
    onError: (err) => setFormError(friendlyError(err))
  });
  void onError;
  return (
    <Modal open onClose={onClose} title={`Change role — ${user.name}`}>
      <div className="space-y-3">
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="Staff">Staff</option>
          <option value="Admin">Admin</option>
        </Select>
        {formError && <p className="text-sm text-danger">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || role === user.role}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteUserModal({ user, onClose, onDone, onError }: { user: UserRow; onClose: () => void; onDone: () => void; onError: (m: string) => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => call("users:delete", { id: user.id }),
    onSuccess: onDone,
    onError: (err) => setFormError(friendlyError(err))
  });
  void onError;
  return (
    <Modal open onClose={onClose} title={`Delete ${user.name}?`}>
      <p className="text-sm text-slate-700">
        This permanently removes the user. If they have any activity in the audit log, deletion will fail —
        disable them instead.
      </p>
      {formError && <p className="mt-3 text-sm text-danger">{formError}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => mut.mutate()} disabled={mut.isPending}>Delete</Button>
      </div>
    </Modal>
  );
}
