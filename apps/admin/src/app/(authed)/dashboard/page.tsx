import { getSessionUser } from "@/lib/auth-session";
import { PendingVerifyCard } from "./PendingVerifyCard";

export default async function DashboardPage() {
  const user = (await getSessionUser())!;
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Dashboard</h1>
      <p className="text-gray-700">
        Welcome, {user.username}. You are signed in as <strong>{user.role}</strong>.
      </p>
      <div className="mt-6">
        <PendingVerifyCard jwt={user.token} isAdmin={user.role === "Admin"} />
      </div>
    </div>
  );
}
