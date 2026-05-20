import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/lib/toast.store";

interface CloudFormValues {
  cloudSyncEnabled: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  razorpayWebhookSecret: string;
}

function extractWebhookUrl(supabaseUrl: string): string | null {
  try {
    const u = new URL(supabaseUrl);
    return `${u.protocol}//${u.host}/functions/v1/razorpay-webhook`;
  } catch {
    return null;
  }
}

export function CloudSyncTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [serviceKeySaved, setServiceKeySaved] = useState(false);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const { data: s } = useQuery({
    queryKey: ["settings"],
    queryFn: () => call<any>("settings:get"),
  });

  const { data: status } = useQuery({
    queryKey: ["cloud", "status"],
    queryFn: () => call<any>("cloud:getStatus", {}),
    refetchInterval: 30_000,
  });

  const { register, handleSubmit, reset, watch } = useForm<CloudFormValues>({
    defaultValues: {
      cloudSyncEnabled: false,
      supabaseUrl: "",
      supabaseAnonKey: "",
      supabaseServiceKey: "",
      razorpayWebhookSecret: "",
    },
  });

  useEffect(() => {
    if (!s) return;
    setServiceKeySaved(s.supabaseServiceKey === "***");
    setWebhookSaved(s.razorpayWebhookSecret === "***");
    reset({
      cloudSyncEnabled: !!s.cloudSyncEnabled,
      supabaseUrl: s.supabaseUrl ?? "",
      supabaseAnonKey: s.supabaseAnonKey ?? "",
      supabaseServiceKey: "",
      razorpayWebhookSecret: "",
    });
  }, [s, reset]);

  const save = useMutation({
    mutationFn: (v: CloudFormValues) => {
      const payload: Record<string, unknown> = {
        cloudSyncEnabled: !!v.cloudSyncEnabled,
        supabaseUrl: v.supabaseUrl,
        supabaseAnonKey: v.supabaseAnonKey,
      };
      const sk = v.supabaseServiceKey.trim();
      if (sk && sk !== "***") payload.supabaseServiceKey = sk;
      const ws = v.razorpayWebhookSecret.trim();
      if (ws && ws !== "***") payload.razorpayWebhookSecret = ws;
      return call("settings:update", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["cloud", "status"] });
      toast.success("Saved.");
    },
  });

  async function handleTest() {
    setTesting(true);
    try {
      const r = await call<{ ok: boolean; latencyMs: number }>("cloud:testConnection", {});
      toast.success(`Connected (${r.latencyMs}ms)`);
    } catch (err: any) {
      toast.error(err?.message ?? "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const r = await call<{ ok: boolean; skipped: boolean }>("cloud:runBackfillNow", {});
      if (r.skipped) toast.success("Backfill skipped (already complete or sync disabled).");
      else toast.success("Backfill queued — watch the Sync log.");
      qc.invalidateQueries({ queryKey: ["cloud", "status"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  }

  const enabled = watch("cloudSyncEnabled");
  const supabaseUrl = watch("supabaseUrl");
  const webhookUrl = extractWebhookUrl(supabaseUrl);
  const backfillDone = !!status?.backfillCompletedAt;

  if (!s) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Cloud sync</h1>

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <Card>
          <h2 className="mb-4 text-lg font-medium">Master switch</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("cloudSyncEnabled")} className="accent-brand" />
            Enable cloud sync
          </label>
          {!enabled && (
            <p className="mt-2 text-xs text-slate-500">
              Cloud sync is required for the future Patient Portal and Web Admin Portal. The lab works fully without it.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-medium">Supabase</h2>
          <div className="grid grid-cols-1 gap-3">
            <Input label="Project URL" placeholder="https://xxxx.supabase.co" {...register("supabaseUrl")} />
            <Input label="Anon key" placeholder="eyJhbGciOiJI…" {...register("supabaseAnonKey")} />
            <Input
              label="Service role key"
              type="password"
              placeholder={serviceKeySaved ? "saved — leave blank to keep" : "Paste service role key…"}
              {...register("supabaseServiceKey")}
            />
          </div>
          <div className="mt-4">
            <Button type="button" variant="secondary" onClick={handleTest} disabled={testing}>
              {testing ? "Testing…" : "Test connection"}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-medium">Razorpay webhook</h2>
          <Input
            label="Webhook secret"
            type="password"
            placeholder={webhookSaved ? "saved — leave blank to keep" : "Paste webhook secret from Razorpay…"}
            {...register("razorpayWebhookSecret")}
          />
          {webhookUrl && (
            <div className="mt-3">
              <div className="text-sm font-medium text-slate-700">Webhook URL</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-slate-100 px-2 py-1 text-xs">{webhookUrl}</code>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copied."); }}
                >
                  Copy
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">Paste this into your Razorpay dashboard → Webhooks.</p>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-medium">Backfill</h2>
          <p className="mb-3 text-sm text-slate-600">
            {backfillDone
              ? `Backfill completed ${new Date(status.backfillCompletedAt).toLocaleString()}.`
              : "Push all existing lab data to the cloud. Runs in the background."}
          </p>
          <Button type="button" variant="secondary" onClick={handleBackfill} disabled={backfilling || backfillDone}>
            {backfilling ? "Queueing…" : backfillDone ? "Backfill complete" : "Run backfill now"}
          </Button>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default CloudSyncTab;
