import { getSessionUser } from "@/lib/auth-session";
import { listAuditLogs, listDistinctAuditActions } from "@/lib/data-audit";
import { AuditList } from "./AuditList";
import { PageHeader } from "@/components/PageHeader";
import { redirect } from "next/navigation";

export default async function AuditPage({ searchParams }: { searchParams: { action?: string } }) {
  const user = (await getSessionUser())!;
  if (user.role !== "Admin") redirect("/dashboard");
  const action = searchParams.action;
  const logs = await listAuditLogs(user.token, 200, action ? { action } : undefined);
  const actions = await listDistinctAuditActions(user.token);
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every change, who made it, and when" />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="action" defaultValue={action ?? ""} className="input max-w-xs">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button type="submit" className="btn-ghost">Filter</button>
      </form>
      <AuditList logs={logs} />
    </div>
  );
}
