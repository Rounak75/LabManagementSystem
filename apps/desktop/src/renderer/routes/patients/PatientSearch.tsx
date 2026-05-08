import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Link, useNavigate } from "react-router-dom";

type Patient = { id: string; patientId: string; name: string; age: number; sex: string; phone: string; createdAt: string };

export default function PatientSearch() {
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const { data: patients = [] } = useQuery({
    queryKey: ["patients", q],
    queryFn: () => call<Patient[]>("patients:search", { q })
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <Button onClick={() => nav("/patients/new")}>+ Register patient</Button>
      </div>
      <Input className="mb-4 max-w-md" placeholder="Search by name, phone, or LAB-YYYY-NNNNN…" value={q} onChange={e => setQ(e.target.value)} />
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="px-4 py-3">Patient ID</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Age/Sex</th><th className="px-4 py-3">Phone</th><th /></tr>
          </thead>
          <tbody>
            {patients.map(p => (
              <tr key={p.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">{p.patientId}</td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">{p.age} / {p.sex}</td>
                <td className="px-4 py-3">{p.phone}</td>
                <td className="px-4 py-3 text-right"><Link to={`/patients/${p.id}`} className="text-brand hover:underline">Open</Link></td>
              </tr>
            ))}
            {patients.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No patients found.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
