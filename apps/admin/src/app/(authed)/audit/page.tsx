import { getSessionUser } from "@/lib/auth-session";
import { listAuditLogs, listDistinctAuditActions } from "@/lib/data-audit";
import { AuditList } from "./AuditList";
import { redirect } from "next/navigation";

export default async function AuditPage({ searchParams }: { searchParams: { action?: string } }) {
  const user = (await getSessionUser())!;
  if (user.role !== "Admin") redirect("/dashboard");
  const action = searchParams.action;
  const logs = await listAuditLogs(user.token, 200, action ? { action } : undefined);
  const actions = await listDistinctAuditActions(user.token);
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Audit log</h1>
      <form>
        <select name="action" defaultValue={action ?? ""} className="border rounded px-3 py-2 mb-4">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button type="submit" className="ml-2 border rounded px-3 py-2 text-sm">Filter</button>
      </form>
      <AuditList logs={logs} />
    </div>
  );
}
