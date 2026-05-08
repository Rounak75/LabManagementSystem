import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";

type Row = { id: string; visitId: string; visitDate: string; patient: { name: string; patientId: string };
  visitTests: { test: { name: string } }[] };

export default function ReportsList() {
  const { data: rows = [] } = useQuery({ queryKey: ["reports"], queryFn: () => call<Row[]>("reports:listReady") });
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Reports ready</h1>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="px-4 py-3">Visit</th><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Tests</th><th /></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">{r.visitId}</td>
                <td className="px-4 py-3">{r.patient.name} <span className="text-xs text-slate-500 font-mono">{r.patient.patientId}</span></td>
                <td className="px-4 py-3 text-slate-500">{r.visitTests.map(vt => vt.test.name).join(", ")}</td>
                <td className="px-4 py-3 text-right"><Link to={`/reports/${r.id}`} className="text-brand hover:underline">Open</Link></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No completed visits yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
