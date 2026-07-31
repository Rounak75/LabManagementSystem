"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Band, Card, Container, btnPrimary } from "@portal/components/ui";
import { Check } from "@portal/components/icons";

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
    <>
      <Band waves className="pb-16">
        <Container className="pt-8">
          <div className="mx-auto max-w-md text-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-band/60">
              Sign-in
            </p>
            <h1 className="mt-3 font-heading text-[28px] font-extrabold leading-[1.08] tracking-tighter text-band">
              Multiple patients found
            </h1>
            <p className="mt-3 text-[14px] leading-relaxed text-band/70">
              This phone number is registered to more than one patient. Whose
              report are you trying to view?
            </p>
          </div>
        </Container>
      </Band>

      <Container>
        <form onSubmit={handleContinue} className="mx-auto -mt-8 max-w-md">
          <Card className="space-y-3 p-5">
            {payload.patients.map((p) => {
              const active = chosen === p.id;
              return (
                <label
                  key={p.id}
                  className={`tap flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 ${
                    active
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface hover:border-brand/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="patient"
                    value={p.id}
                    checked={active}
                    onChange={(e) => setChosen(e.target.value)}
                    className="sr-only"
                  />
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-[13px] font-bold ${
                      active ? "bg-brand text-brand-fg" : "bg-brand-soft text-brand"
                    }`}
                  >
                    {active ? <Check size={17} /> : p.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-text">
                      {p.name}
                    </span>
                    <span className="block text-[12.5px] text-muted">
                      {p.age} years · {p.sex}
                    </span>
                  </span>
                </label>
              );
            })}

            {error && (
              <div className="rounded-2xl bg-alert-soft px-4 py-3.5 text-[13px] leading-relaxed text-text">
                {error}
              </div>
            )}

            <button type="submit" disabled={!chosen} className={`${btnPrimary} w-full`}>
              Continue
            </button>
          </Card>
        </form>
      </Container>
    </>
  );
}
