import { getSessionUser } from "@/lib/auth-session";

export default async function AccountPage() {
  const user = (await getSessionUser())!;
  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-semibold mb-4">Your account</h1>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-gray-500">Username</dt>
        <dd>{user.username}</dd>
        <dt className="text-gray-500">Role</dt>
        <dd>{user.role}</dd>
      </dl>
      <p className="text-sm text-gray-500 mt-6">
        Password change + &ldquo;sign out everywhere&rdquo; added in Plan G.
      </p>
    </div>
  );
}
