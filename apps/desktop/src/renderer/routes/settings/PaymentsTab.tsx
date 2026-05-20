import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/lib/toast.store";
import { validateVpa } from "@/lib/upi";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentsFormValues {
  razorpayMode: "Off" | "Test" | "Live";
  razorpayKeyId: string;
  razorpayKeySecret: string;
  smsTemplatePaymentLink: string;
  smsTemplateReportReadyWithLink: string;
  labUpiVpa: string;
  labUpiPayeeName: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [keySecretSaved, setKeySecretSaved] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const { data: s } = useQuery({
    queryKey: ["settings"],
    queryFn: () => call<any>("settings:get"),
  });

  const { register, handleSubmit, reset, watch } = useForm<PaymentsFormValues>({
    defaultValues: {
      razorpayMode: "Off",
      razorpayKeyId: "",
      razorpayKeySecret: "",
      smsTemplatePaymentLink: "",
      smsTemplateReportReadyWithLink: "",
      labUpiVpa: "",
      labUpiPayeeName: "",
    },
  });

  useEffect(() => {
    if (!s) return;
    setKeySecretSaved(s.razorpayKeySecret === "***");
    reset({
      razorpayMode: s.razorpayMode ?? "Off",
      razorpayKeyId: s.razorpayKeyId ?? "",
      razorpayKeySecret: "",   // never pre-fill secrets
      smsTemplatePaymentLink: s.smsTemplatePaymentLink ?? "",
      smsTemplateReportReadyWithLink: s.smsTemplateReportReadyWithLink ?? "",
      labUpiVpa: s.labUpiVpa ?? "",
      labUpiPayeeName: s.labUpiPayeeName ?? "",
    });
  }, [s, reset]);

  const save = useMutation({
    mutationFn: (v: PaymentsFormValues) => {
      const payload: Record<string, unknown> = {
        razorpayMode: v.razorpayMode,
        razorpayKeyId: v.razorpayKeyId,
        smsTemplatePaymentLink: v.smsTemplatePaymentLink,
        smsTemplateReportReadyWithLink: v.smsTemplateReportReadyWithLink,
        labUpiVpa: v.labUpiVpa.trim() || null,
        labUpiPayeeName: v.labUpiPayeeName.trim() || null,
      };
      // Only include the secret when the user typed a new value
      const secret = v.razorpayKeySecret.trim();
      if (secret && secret !== "***") {
        payload.razorpayKeySecret = secret;
      }
      return call("settings:update", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Saved.");
    },
  });

  async function handleTestConnection() {
    setTestingConnection(true);
    try {
      const result = await call<{ mode: string; error?: string }>("payments:testConnection", {});
      if (result.error) {
        toast.error(result.error);
      } else if (result.mode === "live") {
        toast.success("Connected (Live mode)");
      } else {
        toast.success("Connected to Razorpay (Test mode)");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Connection test failed");
    } finally {
      setTestingConnection(false);
    }
  }

  // ─── Derived state ──────────────────────────────────────────────────────────

  const razorpayMode = watch("razorpayMode");
  const upiVpa = watch("labUpiVpa");
  const upiVpaInvalid = upiVpa.length > 0 && !validateVpa(upiVpa);

  if (!s) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Payments</h1>

      <form onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-4">

        {/* ── Razorpay settings (hidden until KYC clears) ───────────────── */}
        {false && (
        <Card>
          <h2 className="mb-4 text-lg font-medium">Razorpay</h2>

          {/* Mode radio */}
          <div className="mb-4">
            <div className="mb-1 text-sm font-medium text-slate-700">Mode</div>
            <div className="flex gap-6">
              {(["Off", "Test", "Live"] as const).map(m => (
                <label key={m} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="radio" value={m} {...register("razorpayMode")} className="accent-brand" />
                  {m}
                </label>
              ))}
            </div>
            {razorpayMode === "Live" && (
              <p className="mt-1 text-xs text-slate-500">
                Live mode requires completed KYC on your Razorpay dashboard.
              </p>
            )}
          </div>

          {/* API credentials */}
          <div className="mb-4 grid grid-cols-1 gap-3">
            <Input
              label="Key ID"
              placeholder="rzp_test_… or rzp_live_…"
              {...register("razorpayKeyId")}
            />
            <Input
              label="Key Secret"
              type="password"
              placeholder={keySecretSaved ? "saved — leave blank to keep" : "Paste key secret…"}
              {...register("razorpayKeySecret")}
            />
          </div>

          {/* Test connection button */}
          <Button
            type="button"
            variant="secondary"
            onClick={handleTestConnection}
            disabled={testingConnection}
          >
            {testingConnection ? "Testing…" : "Test connection"}
          </Button>
        </Card>
        )}

        {/* ── UPI direct payments ───────────────────────────────────────── */}
        <Card>
          <h2 className="mb-4 text-lg font-medium">UPI direct payment</h2>
          <p className="mb-3 text-sm text-slate-600">
            Show a QR code that patients scan with any UPI app (PhonePe, GPay, Paytm, BHIM).
            Money goes straight to your bank account. No gateway, no KYC, no fees.
          </p>
          <div className="grid grid-cols-1 gap-3">
            <Input
              label="UPI ID (VPA)"
              placeholder="9876543210@ybl"
              {...register("labUpiVpa")}
            />
            {upiVpaInvalid && (
              <p className="-mt-2 text-xs text-amber-700">
                That doesn&apos;t look like a standard UPI ID. Test with any UPI app before going live.
              </p>
            )}
            <Input
              label="Payee name shown to patient"
              placeholder="(leave blank to use lab name)"
              {...register("labUpiPayeeName")}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Tip: use the UPI ID linked to your lab&apos;s bank account. You can find it in your UPI app under
            &quot;My UPI IDs&quot; or &quot;UPI Profile&quot;.
          </p>
        </Card>

        {/* ── DLT template IDs ──────────────────────────────────────────── */}
        <Card>
          <h2 className="mb-4 text-lg font-medium">DLT Template IDs</h2>
          <div className="grid grid-cols-1 gap-3">
            <Input
              label="Payment link SMS"
              {...register("smsTemplatePaymentLink")}
            />
            <Input
              label="Report ready with payment link"
              {...register("smsTemplateReportReadyWithLink")}
            />
          </div>
        </Card>

        {/* ── Save ──────────────────────────────────────────────────────── */}
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default PaymentsTab;
