"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ChooserPayload {
  phone: string;
  code: string;
  patients: { id: string; name: string; age: number; sex: string }[];
}

export default function SelectPatientPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<ChooserPayload | null>(null);
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("login_chooser");
    if (!raw) { router.replace("/login"); return; }
    setPayload(JSON.parse(raw));
  }, [router]);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!payload || !chosen) return;
    const res = await fetch("/api/auth/select-patient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: payload.phone, code: payload.code, patientId: chosen }),
    });
    const data = await res.json();
    sessionStorage.removeItem("login_chooser");
    if (res.ok) router.push(data.redirectTo);
    else setError(data.error === "invalid_code"
      ? "The access code doesn't belong to this patient. Try a different one or check your receipt."
      : "Login failed.");
  }

  if (!payload) return null;

  return (
    <div className="max-w-md mx-auto mt-8">
      <h1 className="text-xl font-semibold mb-2">Multiple patients found</h1>
      <p className="text-sm text-gray-600 mb-4">Whose report are you trying to view?</p>
      <form onSubmit={handleContinue} className="space-y-3 bg-white p-6 rounded border border-gray-200">
        {payload.patients.map((p) => (
          <label key={p.id} className="flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-gray-50">
            <input type="radio" name="patient" value={p.id}
              checked={chosen === p.id} onChange={(e) => setChosen(e.target.value)} />
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-gray-500">{p.age} years · {p.sex}</div>
            </div>
          </label>
        ))}
        {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">{error}</div>}
        <button type="submit" disabled={!chosen}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-medium disabled:opacity-50">
          Continue
        </button>
      </form>
    </div>
  );
}
