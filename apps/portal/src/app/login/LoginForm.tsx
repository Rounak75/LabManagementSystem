"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ nextUrl }: { nextUrl: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"code" | "password">("code");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body =
        mode === "code"
          ? { phone, code, next: nextUrl }
          : { phone, password, next: nextUrl };
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
      setError(
        data.error?.code === "no_patient_found"
          ? "We can't find a patient with this phone number. Please contact the lab."
          : data.error?.code === "invalid_code"
          ? mode === "code"
            ? "That access code doesn't match. Please check your receipt."
            : "Incorrect password."
          : "Sign-in failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (lockedUntil) {
    return (
      <div className="rounded-xl border border-notice/30 bg-notice-soft p-4 text-[13.5px] text-text">
        Too many failed attempts. Please try again at{" "}
        <strong className="text-text font-mono num">
          {new Date(lockedUntil).toLocaleTimeString()}
        </strong>
        , or call the lab at{" "}
        <a className="text-brand hover:underline" href="tel:6202924306">
          6202924306
        </a>{" "}
        to verify your identity.
      </div>
    );
  }

  const inputCls =
    "block w-full rounded-lg bg-bg border border-line text-text px-3.5 py-2.5 text-[14.5px] placeholder:text-muted focus:outline-none focus:border-brand";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-line bg-elev p-5 space-y-4"
    >
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="inline-flex rounded-lg bg-surface border border-line p-1"
      >
        <ModeTab
          active={mode === "code"}
          onClick={() => setMode("code")}
          label="Access code"
        />
        <ModeTab
          active={mode === "password"}
          onClick={() => setMode("password")}
          label="Password"
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
          placeholder="9876543210"
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
            className={`${inputCls} font-mono text-[17px] tracking-[0.3em] uppercase`}
            placeholder="K7P2QX"
          />
        </Field>
      ) : (
        <Field label="Password" hint="Set after first sign-in via Access code">
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

      {error && (
        <div className="rounded-lg border border-brand/40 bg-brand-soft text-[13.5px] text-text px-3 py-2.5">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-brand text-brand-fg py-3 text-[14.5px] font-semibold tap hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>

      <details className="text-[12.5px] text-soft pt-2 border-t border-line">
        <summary className="cursor-pointer hover:text-text">
          I don't have my receipt
        </summary>
        <p className="mt-2 leading-relaxed">
          Call the lab at{" "}
          <a className="text-brand hover:underline" href="tel:6202924306">
            6202924306
          </a>{" "}
          — staff can read your code to you over the phone after confirming your
          identity.
        </p>
      </details>
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
      className={`px-3 py-1.5 rounded-md text-[13px] tap ${
        active
          ? "bg-elev text-text border border-line shadow-sm"
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
      <span className="block text-[12.5px] text-soft mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-muted mt-1.5">{hint}</span>}
    </label>
  );
}
