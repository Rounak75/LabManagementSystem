import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { call } from "@/lib/api";
import { useAuth } from "@/stores/auth.store";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { useNavigate } from "react-router-dom";
import type { FirstRunCompleteResult, SaveTextFileResult } from "@shared/api";

const Schema = z.object({
  adminName: z.string().min(2),
  adminUsername: z.string().min(3).regex(/^[a-z0-9_]+$/i, "letters, digits, underscore only"),
  adminPassword: z.string().min(8),
  labName: z.string().min(2),
  labAddress: z.string().min(2),
  labPhone: z.string().regex(/^[0-9+\-\s]{7,}$/, "phone number required"),
  morningOpenTime: z.string().regex(/^\d{2}:\d{2}$/),
  morningCloseTime: z.string().regex(/^\d{2}:\d{2}$/),
  eveningOpenTime: z.string().optional(),
  eveningCloseTime: z.string().optional(),
  childAgeBoundary: z.coerce.number().int().min(1).max(18),
  pathologistName: z.string().optional(),
  pathologistQuals: z.string().optional()
});
type Form = z.infer<typeof Schema>;

// Renderer-safe inline copy of formatForDisplay (avoids importing main-side bcryptjs).
function formatForDisplay(code: string): string {
  return [code.slice(0, 4), code.slice(4, 8), code.slice(8, 12), code.slice(12, 16)].join("-");
}

export default function FirstRunWizard() {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const needed = await call<boolean>("auth:firstRunNeeded");
        if (!cancelled && !needed) {
          nav("/login", { replace: true });
        }
      } catch {
        // If the check fails, leave the wizard rendered; submission errors will surface there.
      }
    })();
    return () => { cancelled = true; };
  }, [nav]);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    defaultValues: {
      labName: "Golmuri Janch Ghar",
      labAddress: "Main Road, Golmuri Chowk, Jamshedpur",
      labPhone: "6202924306",
      morningOpenTime: "08:00",
      morningCloseTime: "13:00",
      eveningOpenTime: "18:00",
      eveningCloseTime: "20:00",
      childAgeBoundary: 12
    }
  });

  async function onSubmit(v: Form) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    const parsed = Schema.safeParse(v);
    if (!parsed.success) { setError(parsed.error.errors[0]?.message ?? "Invalid input"); submittingRef.current = false; return; }
    try {
      const result = await call<FirstRunCompleteResult>("auth:firstRunComplete", {
        admin: { name: v.adminName, username: v.adminUsername, password: v.adminPassword },
        settings: {
          labName: v.labName, labAddress: v.labAddress, labPhone: v.labPhone,
          morningOpenTime: v.morningOpenTime, morningCloseTime: v.morningCloseTime,
          eveningOpenTime: v.eveningOpenTime || undefined,
          eveningCloseTime: v.eveningCloseTime || undefined,
          childAgeBoundary: Number(v.childAgeBoundary),
          pathologistName: v.pathologistName, pathologistQuals: v.pathologistQuals
        }
      });
      // Sync renderer auth state with the session that the main process already set.
      useAuth.setState({ user: result.user, loading: false });
      setRecoveryCode(result.recoveryCode);
    } catch (e: any) {
      setError(e.message);
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

  if (recoveryCode) {
    const formatted = formatForDisplay(recoveryCode);
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center p-6">
        <Card className="w-full">
          <h1 className="mb-2 text-2xl font-semibold text-brand">Save your recovery code</h1>
          <p className="mb-6 text-sm text-slate-600">
            This is the ONLY way to reset the Admin password if it is forgotten.
            Write it down or save it somewhere safe. We will never show it again.
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
              onClick={() => nav("/", { replace: true })}
            >
              Continue
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center p-6">
      <Card className="w-full">
        <h1 className="mb-2 text-2xl font-semibold text-brand">Welcome to your lab system</h1>
        <p className="mb-6 text-sm text-slate-600">Set up your Admin account and confirm lab details. You only do this once.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Admin full name" {...register("adminName")} error={errors.adminName?.message} />
          <Input label="Admin username"  {...register("adminUsername")} error={errors.adminUsername?.message} />
          <Input label="Admin password (min 8)" type="password" {...register("adminPassword")} error={errors.adminPassword?.message} />
          <div className="md:col-span-2 my-2 border-t" />
          <Input label="Lab name"      {...register("labName")} error={errors.labName?.message} />
          <Input label="Lab phone"     {...register("labPhone")} error={errors.labPhone?.message} />
          <Input label="Lab address"   className="md:col-span-2" {...register("labAddress")} error={errors.labAddress?.message} />
          <Input label="Morning open"  type="time" {...register("morningOpenTime")} />
          <Input label="Morning close" type="time" {...register("morningCloseTime")} />
          <Input label="Evening open"  type="time" {...register("eveningOpenTime")} />
          <Input label="Evening close" type="time" {...register("eveningCloseTime")} />
          <Input label="Child age boundary (years)" type="number" {...register("childAgeBoundary")} />
          <Input label="Pathologist name (optional)" {...register("pathologistName")} />
          <Input label="Pathologist qualifications (optional)" className="md:col-span-2" {...register("pathologistQuals")} />
          {error && <div className="md:col-span-2 text-sm text-danger">{error}</div>}
          <div className="md:col-span-2 mt-4 flex justify-end">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Setting up…" : "Finish setup"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
