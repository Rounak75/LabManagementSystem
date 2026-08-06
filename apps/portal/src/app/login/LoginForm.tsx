"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, IconChip, Note, btnPrimary, fieldLabel, hintCls, inputCls } from "@portal/components/ui";
import { ArrowLeft, ArrowRight, Lock, Phone, ShieldAlert } from "@portal/components/icons";

import { clockTime } from "@portal/lib/format";

export function LoginForm({ nextUrl }: { nextUrl: string }) {
  const router = useRouter();
  // "first" covers everyone signing in for the first time, with whichever id the
  // lab gave them. The lab prints no receipts, so a walk-in's access code does
  // not reach them until the finished report at the end of the visit, and a
  // patient who booked online has never been handed anything at all. Without
  // this tab, neither could get in when it actually matters to them — while the
  // report is being worked on and the bill is waiting.
  const [mode, setMode] = useState<"first" | "password" | "code">("first");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  // One box for both LAB- and BKG- ids; the server tells them apart by prefix.
  const [firstTimeId, setFirstTimeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  // Password-mode chooser is handled here rather than on /select-patient: that
  // page round-trips through sessionStorage, and a password must not be written
  // there. Keeping it in memory means the patient picks and we resubmit.
  const [choices, setChoices] = useState<{ id: string; name: string; age: number }[] | null>(null);
  // Only shown once the server says this origin has been failing repeatedly —
  // a patient signing in normally never sees it.
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  async function refreshCaptcha() {
    try {
      const res = await fetch("/api/captcha", { cache: "no-store" });
      const data = await res.json();
      setCaptchaQuestion(data.question ?? "");
      setCaptchaToken(data.token ?? "");
      setCaptchaAnswer("");
    } catch {
      setCaptchaQuestion("");
      setCaptchaToken("");
    }
  }

  async function submit(patientId?: string) {
    setError(null);
    setSubmitting(true);
    try {
      const captcha = captchaToken
        ? { captchaToken, captchaAnswer: parseInt(captchaAnswer, 10) }
        : {};
      const body =
        mode === "code"
          ? { phone, code, next: nextUrl, patientId, ...captcha }
          : mode === "first"
          ? { phone, firstTimeId, next: nextUrl, ...captcha }
          : { phone, password, next: nextUrl, patientId, ...captcha };
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.redirectTo) {
        router.push(data.redirectTo);
        return;
      }
      if (data.needsChooser) {
        if (mode === "password") {
          // Keep the password in memory and pick inline.
          setChoices(data.patients);
          return;
        }
        sessionStorage.setItem(
          "login_chooser",
          JSON.stringify({ phone, code, patients: data.patients })
        );
        router.push("/select-patient");
        return;
      }
      if (data.error?.code === "account_locked") {
        setLockedUntil(data.until);
        return;
      }
      if (data.captchaRequired) {
        // Always a fresh puzzle: the previous token is spent, and reusing it
        // would fail on the next submit for a reason the patient can't see.
        await refreshCaptcha();
        setError("Please answer the question below to continue.");
        return;
      }
      // A spent answer left in the box would fail the next submit for a reason
      // the patient cannot see.
      if (captchaToken) await refreshCaptcha();
      setError(
        data.error?.code === "no_patient_found"
          ? "We can't find a patient with this phone number. Please contact the lab."
          : data.error?.code === "booking_not_ready"
          ? data.error.message
          : data.error?.code === "invalid_code"
          ? mode === "code"
            ? "That access code doesn't match. Please check the code on your report."
            : mode === "first"
            ? "That ID doesn't match this phone number. Check it with the lab — and if you've already set a password, sign in with Password instead."
            : "Incorrect password."
          : "Sign-in failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit();
  }

  if (choices) {
    return (
      <Card className="p-6">
        <h2 className="font-heading text-[16px] font-bold tracking-snug text-text">
          Who is signing in?
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          This phone number is shared by more than one patient.
        </p>
        <ul className="mt-4 space-y-2">
          {choices.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit(p.id)}
                className="tap flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left hover:border-brand/40 hover:bg-elev disabled:opacity-50"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft font-heading text-[13px] font-bold text-brand">
                  {p.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-text">
                    {p.name}
                  </span>
                  <span className="block text-[12.5px] text-muted">age {p.age}</span>
                </span>
                <ArrowRight size={16} className="shrink-0 text-brand" />
              </button>
            </li>
          ))}
        </ul>
        {error && (
          <div className="mt-4 rounded-2xl bg-alert-soft px-4 py-3 text-[13px] text-text">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={() => setChoices(null)}
          className="tap mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-soft hover:text-text"
        >
          <ArrowLeft size={14} />
          Back
        </button>
      </Card>
    );
  }

  if (lockedUntil) {
    return (
      <Card className="p-6">
        <IconChip tone="notice">
          <ShieldAlert size={20} />
        </IconChip>
        <h2 className="mt-4 font-heading text-[16px] font-bold tracking-snug text-text">
          Too many failed attempts
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-soft">
          Please try again at{" "}
          <strong className="font-mono num font-medium text-text">
            {clockTime(lockedUntil)}
          </strong>
          , or call the lab to verify your identity.
        </p>
        <a
          href="tel:6202924306"
          className="tap mt-5 inline-flex items-center gap-2 rounded-2xl bg-brand px-5 py-3 font-mono num text-[14px] font-semibold text-brand-fg hover:bg-brand-hover"
        >
          <Phone size={15} />
          6202924306
        </a>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="space-y-5 p-6">
        {/* Segmented control — one filled pill, one plain. */}
        <div
          role="tablist"
          aria-label="Sign-in method"
          className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1"
        >
          <ModeTab
            active={mode === "first"}
            onClick={() => setMode("first")}
            label="First time"
          />
          <ModeTab
            active={mode === "password"}
            onClick={() => setMode("password")}
            label="Password"
          />
          <ModeTab
            active={mode === "code"}
            onClick={() => setMode("code")}
            label="Access code"
          />
        </div>

        <Field label="Phone number" hint="10 digits, no spaces">
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            required
            autoComplete="tel-national"
            className={`${inputCls} font-mono num`}
            placeholder="Your 10-digit number"
          />
        </Field>

        {mode === "code" ? (
          <Field
            label="Access code"
            hint="6 characters · printed at the bottom of your receipt"
          >
            <input
              type="text"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              autoComplete="one-time-code"
              className={`${inputCls} text-center font-mono text-[20px] font-medium uppercase tracking-[0.4em]`}
              placeholder="K7P2QX"
            />
          </Field>
        ) : mode === "first" ? (
          <Field
            label="Your patient ID or booking ID"
            hint="The lab gives you this when you register. Home collection? Use the booking ID from your confirmation email."
          >
            <input
              type="text"
              value={firstTimeId}
              onChange={(e) => setFirstTimeId(e.target.value.toUpperCase())}
              required
              className={`${inputCls} text-center font-mono text-[17px] font-medium uppercase tracking-[0.12em]`}
              placeholder="LAB-2026-00042"
            />
          </Field>
        ) : (
          <Field label="Password" hint="Set after your first sign-in">
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={inputCls}
            />
          </Field>
        )}

        {captchaQuestion && (
          <Field label={captchaQuestion} hint="A quick check that you're not a script">
            <input
              type="text"
              inputMode="numeric"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value.replace(/\D/g, ""))}
              required
              autoComplete="off"
              className={`${inputCls} font-mono num`}
              placeholder="Type the number"
            />
          </Field>
        )}

        {error && (
          <div className="rounded-2xl bg-alert-soft px-4 py-3.5 text-[13px] leading-relaxed text-text">
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
          <Lock size={16} />
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </Card>

      <div className="mt-4">
        <Note>
          <span className="font-semibold text-text">Signing in for the first time?</span>{" "}
          Use the <span className="font-semibold text-text">patient ID</span> the lab gave you when
          you registered — it looks like{" "}
          <span className="font-mono text-[12px]">LAB-2026-00042</span>, and it&rsquo;s also printed
          on your report. You&rsquo;ll choose a password straight after, and use that from then on.
          <br />
          <br />
          Don&rsquo;t know your ID? Call the lab at{" "}
          <a className="font-medium text-brand hover:underline" href="tel:6202924306">
            6202924306
          </a>{" "}
          — staff can read it out after confirming who you are.
        </Note>
      </div>
    </form>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      // Sized for three tabs on the narrowest phone the lab's patients use.
      // At the previous 13.5px "Access code" wrapped to two lines on a 360px
      // screen and shunted the whole control taller than its neighbours.
      className={`tap whitespace-nowrap rounded-xl px-1 py-2.5 text-[12px] font-semibold sm:text-[13.5px] ${
        active
          ? "bg-brand text-brand-fg shadow-card"
          : "text-muted hover:text-soft"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={fieldLabel}>{label}</span>
      {children}
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}
