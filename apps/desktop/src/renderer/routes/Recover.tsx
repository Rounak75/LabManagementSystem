import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Link, useNavigate } from "react-router-dom";
import type { RecoverPasswordResult, SaveTextFileResult } from "@shared/api";

const Schema = z.object({
  username: z.string().min(1, "Username is required"),
  recoveryCode: z.string().min(1, "Recovery code is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password")
});
type Form = z.infer<typeof Schema>;

// Renderer-safe inline copy of formatForDisplay (avoids importing main-side bcryptjs).
function formatForDisplay(code: string): string {
  return [code.slice(0, 4), code.slice(4, 8), code.slice(8, 12), code.slice(12, 16)].join("-");
}

export default function Recover() {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } =
    useForm<Form>({ defaultValues: { username: "", recoveryCode: "", newPassword: "", confirmPassword: "" } });

  async function onSubmit(v: Form) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    const parsed = Schema.safeParse(v);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      submittingRef.current = false;
      return;
    }
    if (v.newPassword !== v.confirmPassword) {
      setError("New password and confirmation do not match.");
      submittingRef.current = false;
      return;
    }
    // Normalise the recovery code: strip hyphens and uppercase. Server does the same,
    // but doing it here lets us also validate length up front.
    const cleanedCode = v.recoveryCode.replace(/-/g, "").toUpperCase();
    if (!/^[A-Z0-9]{16}$/.test(cleanedCode)) {
      setError("Recovery code must be 16 letters and digits.");
      submittingRef.current = false;
      return;
    }
    try {
      const result = await call<RecoverPasswordResult>("auth:recoverPassword", {
        username: v.username,
        recoveryCode: cleanedCode,
        newPassword: v.newPassword
      });
      setNewCode(result.newRecoveryCode);
    } catch (e: any) {
      if (e.code === "INVALID_RECOVERY_CODE" || e.message === "INVALID_RECOVERY_CODE") {
        setError("That username or recovery code is wrong.");
      } else {
        setError(e.message ?? "Could not recover password.");
      }
      submittingRef.current = false;
    }
  }

  async function handleCopy(formatted: string) {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  async function handleDownload(formatted: string) {
    setDownloadMsg(null);
    const contents =
      `Lab Recovery Code\n` +
      `-----------------\n` +
      `${formatted}\n` +
      `\n` +
      `Keep this safe. It is the only way to reset the Admin password.\n` +
      `Generated: ${new Date().toISOString()}\n`;
    try {
      const res = await call<SaveTextFileResult>("app:saveTextFile", {
        filename: "lab-recovery-code.txt",
        contents
      });
      if (res.saved) {
        setDownloadMsg(`Saved to ${res.path}`);
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (newCode) {
    const formatted = formatForDisplay(newCode);
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center p-6">
        <Card className="w-full">
          <h1 className="mb-2 text-2xl font-semibold text-brand">Save your new recovery code</h1>
          <p className="mb-6 text-sm text-slate-600">
            Your password has been reset. Your old recovery code no longer works — this is your
            new one. Write it down or save it somewhere safe. We will never show it again.
          </p>

          <div className="mb-6 rounded-md border border-slate-300 bg-slate-50 p-6 text-center">
            <code className="font-mono text-2xl tracking-wider text-slate-900">{formatted}</code>
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            <Button type="button" onClick={() => handleCopy(formatted)}>
              Copy to clipboard
            </Button>
            {copied && <span className="self-center text-sm text-green-600">Copied!</span>}
            <Button type="button" onClick={() => handleDownload(formatted)}>
              Download as .txt
            </Button>
            {downloadMsg && <span className="self-center text-sm text-slate-600">{downloadMsg}</span>}
          </div>

          <label className="mb-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I've written it down or saved it somewhere safe.
          </label>

          {error && <div className="mb-4 text-sm text-danger">{error}</div>}

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!acknowledged}
              onClick={() => nav("/login", { replace: true })}
            >
              Continue to sign in
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Live-uppercase the recovery code field as the user types (visual only — onSubmit also normalises).
  const recoveryCodeValue = watch("recoveryCode") ?? "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-2xl font-semibold text-brand">Recover your password</h1>
        <p className="mb-6 text-xs text-slate-500">
          Enter your recovery code to set a new password.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Username"
            autoFocus
            {...register("username", { required: "Username is required" })}
            error={errors.username?.message}
          />
          <Input
            label="Recovery code"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={recoveryCodeValue}
            onChange={(e) =>
              setValue("recoveryCode", e.target.value.toUpperCase(), { shouldValidate: false })
            }
            error={errors.recoveryCode?.message}
          />
          <Input
            label="New password (min 8)"
            type="password"
            {...register("newPassword", { required: "Password is required" })}
            error={errors.newPassword?.message}
          />
          <Input
            label="Confirm new password"
            type="password"
            {...register("confirmPassword", { required: "Please confirm your password" })}
            error={errors.confirmPassword?.message}
          />
          {error && <div className="text-sm text-danger">{error}</div>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Resetting…" : "Reset password"}
          </Button>
          <div className="text-center">
            <Link to="/login" className="text-xs text-slate-500 hover:text-brand hover:underline">
              Back to sign in
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
