import type { AuditEntry } from "@/lib/data-audit";

export function AuditList({ logs }: { logs: AuditEntry[] }) {
  if (logs.length === 0) {
    return <div className="card p-8 text-center text-sm text-slate-500">No entries.</div>;
  }
  return (
    <ul className="card divide-y divide-slate-100 overflow-hidden text-sm">
      {logs.map((l) => (
        <li key={l.id} className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700">
              {l.action}
            </span>
            <span className="shrink-0 text-xs text-slate-400">{new Date(l.timestamp).toLocaleString("en-IN")}</span>
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{l.userName ?? "—"}</span> · {l.target_entity}/{l.target_id}
          </div>
          {l.details && l.details !== "{}" && (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">{l.details}</pre>
          )}
        </li>
      ))}
    </ul>
  );
}
