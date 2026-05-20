import type { AuditEntry } from "@/lib/data-audit";

export function AuditList({ logs }: { logs: AuditEntry[] }) {
  if (logs.length === 0) return <p className="text-sm text-gray-500">No entries.</p>;
  return (
    <ul className="bg-white rounded border divide-y text-sm">
      {logs.map((l) => (
        <li key={l.id} className="px-3 py-2">
          <div className="flex justify-between">
            <span className="font-medium">{l.action}</span>
            <span className="text-gray-500 text-xs">{new Date(l.timestamp).toLocaleString("en-IN")}</span>
          </div>
          <div className="text-xs text-gray-600">
            {l.userName ?? "—"} · {l.target_entity}/{l.target_id}
          </div>
          {l.details && l.details !== "{}" && (
            <pre className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{l.details}</pre>
          )}
        </li>
      ))}
    </ul>
  );
}
