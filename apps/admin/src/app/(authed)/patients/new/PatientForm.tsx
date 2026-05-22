"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enqueue } from "@/lib/offline-queue";

export function PatientForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const body = {
          name: String(fd.get("name")),
          phone: String(fd.get("phone")),
          email: String(fd.get("email") ?? ""),
          age: Number(fd.get("age")),
          sex: String(fd.get("sex")) as "Male" | "Female" | "Other",
          address: String(fd.get("address") ?? ""),
        };
        startTransition(async () => {
          try {
            const r = await fetch("/api/patients/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!r.ok) throw new Error(await r.text());
            const j = await r.json();
            router.push(`/patients/${j.id}`);
          } catch (e: unknown) {
            if (typeof navigator !== "undefined" && !navigator.onLine) {
              await enqueue({ kind: "patient.create", body });
              setQueued(true);
            } else {
              setError(e instanceof Error ? e.message : "Failed to save");
            }
          }
        });
      }}
      className="space-y-4"
    >
      <Input name="name" label="Full name" required />
      <Input name="phone" label="Phone (10 digits)" required pattern="\d{10}" />
      <Input name="email" label="Email (optional)" type="email" />
      <Input name="age" label="Age (years)" type="number" required />
      <Select name="sex" label="Sex" options={["Male", "Female", "Other"]} required />
      <Input name="address" label="Address (optional)" />
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
      {queued && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          Saved offline. Will sync when you&apos;re back online.
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full sm:w-auto">
        {pending ? "Saving…" : "Save patient"}
      </button>
    </form>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="input" {...rest} />
    </label>
  );
}
function Select({ name, label, options, required }: { name: string; label: string; options: string[]; required?: boolean }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select name={name} required={required} className="input">
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
