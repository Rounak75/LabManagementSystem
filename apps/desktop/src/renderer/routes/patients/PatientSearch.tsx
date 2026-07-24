import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Link, useNavigate } from "react-router-dom";

type Patient = { id: string; patientId: string; name: string; age: number; sex: string; phone: string; createdAt: string };

export default function PatientSearch() {
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday">("all");
  const nav = useNavigate();
  
  const { data: patients = [] } = useQuery({
    queryKey: ["patients", q, dateFilter],
    queryFn: () => call<Patient[]>("patients:search", { q, dateFilter })
  });

  return (
    <div>
      <PageHeader
        title="Patients"
        actions={<Button onClick={() => nav("/patients/new")}>Register patient</Button>}
      />
      
      <div className="mb-4 flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input 
            type="text"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 transition-colors duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" 
            placeholder="Search by name, phone, or LAB-YYYY-NNNNN…" 
            value={q} 
            onChange={e => setQ(e.target.value)} 
          />
        </div>
        <select 
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as any)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors duration-200 hover:border-slate-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
        </select>
      </div>

      <Card noPadding>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Patient ID</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Name</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Age/Sex</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Phone</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {patients.map(p => (
              <tr key={p.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.patientId}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                <td className="px-4 py-3 text-slate-600">{p.age} / {p.sex}</td>
                <td className="px-4 py-3 text-slate-600">{p.phone}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/patients/${p.id}`} className="text-sm font-medium text-brand hover:text-brand-dark">Open</Link>
                </td>
              </tr>
            ))}
            {patients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                  No patients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
