"use client";
import Link from "next/link";
import { formatPhone } from "@/lib/format";

interface Item {
  id: string;
  patient_id: string | null;
  name: string;
  phone: string | null;
  age: number | null;
  sex: string | null;
}

export function PatientList({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-slate-500">
        No patients found. Tap <span className="font-medium text-slate-700">+ New patient</span> to register one.
      </div>
    );
  }
  return (
    <ul className="card divide-y divide-slate-100 overflow-hidden">
      {items.map((p) => (
        <li key={p.id}>
          <Link href={`/patients/${p.id}`} className="row-link">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                {p.name?.[0]?.toUpperCase() ?? "?"}
              </span>
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-900">{p.name}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {p.patient_id ?? "—"} · {p.age ?? "?"}
                  {p.sex ? p.sex[0]!.toLowerCase() : ""} · {p.phone ? formatPhone(p.phone) : "no phone"}
                </div>
              </div>
            </div>
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}
