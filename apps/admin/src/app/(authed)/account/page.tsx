import { getSessionUser } from "@/lib/auth-session";

export default async function AccountPage() {
  const user = (await getSessionUser())!;
  return (
    <div className="max-w-md">
      <h1 className="page-title mb-4">Your account</h1>
      <dl className="card grid grid-cols-2 gap-y-3 p-5 text-sm">
        <dt className="text-slate-500">Username</dt>
        <dd className="font-medium text-slate-900">{user.username}</dd>
        <dt className="text-slate-500">Role</dt>
        <dd className="font-medium text-slate-900">{user.role}</dd>
      </dl>
    </div>
  );
}
