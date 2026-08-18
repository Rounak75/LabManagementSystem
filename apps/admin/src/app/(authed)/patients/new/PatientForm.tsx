"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enqueue } from "@/lib/offline-queue";
import { messageForFailure } from "@/lib/api-error-message";

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
            if (!r.ok) {
              setError(await messageForFailure(r, "Could not save this patient. Try again."));
              return;
            }
            const j = await r.json();
            router.push(`/patients/${j.id}`);
          } catch {
            // The request never reached the server, so this is a transport
            // failure whatever `navigator.onLine` claims — it reports true on
            // lab wi-fi that has associated but has no route out.
            await enqueue({ kind: "patient.create", body });
            setQueued(true);
          }
        });
      }}
      className="space-y-4"
    >
      <Input name="name" label="Full name" required />
      {/* `pattern` alone still opens a QWERTY keyboard on a phone, which is the
          only device this form is filled in on. `type="tel"` + numeric inputMode
          brings up the keypad, and autoComplete lets the browser offer a number
          the staff member has typed before. */}
      <Input
        name="phone"
        label="Phone (10 digits)"
        required
        pattern="\d{10}"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
      />
      <Input name="email" label="Email (optional)" type="email" inputMode="email" autoComplete="email" />
      <Input name="age" label="Age (years)" type="number" inputMode="numeric" required min={0} max={130} />
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
