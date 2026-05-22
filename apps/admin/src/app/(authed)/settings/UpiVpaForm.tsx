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
          className="input mt-1.5"
          value={vpa}
          onChange={(e) => setVpa(e.target.value)}
          placeholder="father@upi"
        />
      </label>
      <label className="block text-sm">
        Payee name
        <input
          className="input mt-1.5"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button disabled={pending} className="btn-primary">
        {pending ? "Saving…" : "Save"}
      </button>
      {saved && <p className="text-sm font-medium text-emerald-700">Saved.</p>}
      {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
    </form>
  );
}
