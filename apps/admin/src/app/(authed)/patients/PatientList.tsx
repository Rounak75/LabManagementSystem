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
  if (items.length === 0) return <p className="text-gray-500">No patients yet.</p>;
  return (
    <ul className="divide-y bg-white rounded border">
      {items.map((p) => (
        <li key={p.id}>
          <Link href={`/patients/${p.id}`} className="flex justify-between px-4 py-3 hover:bg-gray-50">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-gray-500">
                {p.patient_id ?? "—"} · {p.age ?? "?"}
                {p.sex ? p.sex[0]!.toLowerCase() : ""} · {p.phone ? formatPhone(p.phone) : "no phone"}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
