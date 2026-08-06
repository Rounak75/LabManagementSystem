"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Band,
  BandBar,
  Card,
  Container,
  Note,
  btnPrimary,
  fieldLabel,
  hintCls,
  inputCls,
} from "@portal/components/ui";
import { Check, Lock } from "@portal/components/icons";

// useSearchParams needs a Suspense boundary above it, or the whole route opts
// out of static rendering and the build warns.
export default function PasswordPage() {
  return (
    <Suspense fallback={null}>
      <PasswordForm />
    </Suspense>
  );
}

function PasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Sent here straight from a booking-id sign-in. That credential is guessable
  // by counting and never expires, so this is the one screen that has to be
  // finished before anything else — hence no way back to /account from here.
  const firstTime = searchParams.get("first") === "1";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw !== confirm) { setError("Passwords don't match."); return; }
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    const res = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      setDone(true);
      setTimeout(() => router.push(firstTime ? "/dashboard" : "/account"), 1500);
    } else setError("Could not set password. Please try again.");
  }

  return (
    <>
      <Band waves className="pb-14">
        <Container>
          <BandBar
            // No way back on a first-time set: the booking id that got them here
            // is spent the moment a password exists, so leaving without setting
            // one would strand them at a sign-in they can no longer pass.
            back={firstTime ? undefined : { href: "/account", label: "Back to account" }}
            title={firstTime ? "Choose a password" : "Set a password"}
          />
          <p className="pb-3 text-center text-[13px] text-band/65">
            {firstTime
              ? "Your booking ID got you in this once. Choose a password to sign in from now on."
              : "Then you can sign in with either the password or your receipt code."}
          </p>
        </Container>
      </Band>

      <Container>
        <div className="mx-auto -mt-8 max-w-md">
          {done ? (
            <Card className="p-6 text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-ok-soft text-ok">
                <Check size={22} />
              </span>
              <p className="mt-4 font-heading text-[16px] font-bold tracking-snug text-text">
                Password set
              </p>
              <p className="mt-1.5 text-[13px] text-muted">
                Taking you back to your account…
              </p>
            </Card>
          ) : (
            <form onSubmit={handleSubmit}>
              <Card className="space-y-5 p-6">
                <label className="block">
                  <span className={fieldLabel}>New password</span>
                  <input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={inputCls}
                  />
                  <span className={hintCls}>At least 8 characters.</span>
                </label>

                <label className="block">
                  <span className={fieldLabel}>Confirm password</span>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className={inputCls}
                  />
                </label>

                {error && (
                  <div className="rounded-2xl bg-alert-soft px-4 py-3.5 text-[13px] leading-relaxed text-text">
                    {error}
                  </div>
                )}

                <button type="submit" className={`${btnPrimary} w-full`}>
                  <Lock size={16} />
                  Set password
                </button>
              </Card>

              <div className="mt-4">
                <Note>
                  {firstTime
                    ? "Your booking ID stops working once this is set — the password becomes your way in."
                    : "Your access code keeps working after this. A password is just a second way in, useful if you misplace receipts."}
                </Note>
              </div>
            </form>
          )}
        </div>
      </Container>
    </>
  );
}
