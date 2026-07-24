import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

type Row = { id: string; visitId: string; visitDate: string; patient: { name: string; patientId: string };
  visitTests: { test: { name: string } }[] };

export default function ReportsList() {
  const { data: rows = [] } = useQuery({ queryKey: ["reports"], queryFn: () => call<Row[]>("reports:listReady") });
  return (
    <div>
      <PageHeader title="Reports ready" subtitle="Completed visits with all results locked." />
      <Card noPadding>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Visit</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Patient</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Tests</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.visitId}</td>
                <td className="px-4 py-3"><span className="font-medium text-slate-900">{r.patient.name}</span> <span className="text-xs text-slate-500 font-mono">{r.patient.patientId}</span></td>
                <td className="px-4 py-3 text-slate-500">{r.visitTests.map(vt => vt.test.name).join(", ")}</td>
                <td className="px-4 py-3 text-right"><Link to={`/reports/${r.id}`} className="text-sm font-medium text-brand hover:text-brand-dark">Open</Link></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500">No completed visits yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
