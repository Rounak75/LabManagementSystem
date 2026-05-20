"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function UpiVpaForm({
  initial,
  canEdit,
}: {
  initial: { lab_upi_vpa: string; lab_upi_payee_name: string };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [vpa, setVpa] = useState(initial.lab_upi_vpa ?? "");
  const [name, setName] = useState(initial.lab_upi_payee_name ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="text-sm text-gray-600">
        UPI VPA: <code>{vpa || "(not set)"}</code>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        setError(null);
        startTransition(async () => {
          const r = await fetch("/api/settings/upi", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lab_upi_vpa: vpa, lab_upi_payee_name: name }),
          });
          if (r.ok) {
            setSaved(true);
            router.refresh();
          } else {
            setError("Could not save. Try again.");
          }
        });
      }}
      className="space-y-3"
    >
      <label className="block text-sm">
        UPI VPA
        <input
          className="block w-full border rounded px-3 py-2 mt-1"
          value={vpa}
          onChange={(e) => setVpa(e.target.value)}
          placeholder="father@upi"
        />
      </label>
      <label className="block text-sm">
        Payee name
        <input
          className="block w-full border rounded px-3 py-2 mt-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button disabled={pending} className="bg-blue-600 text-white rounded px-3 py-2 text-sm disabled:bg-blue-300">
        {pending ? "Saving…" : "Save"}
      </button>
      {saved && <p className="text-xs text-green-700">Saved.</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
