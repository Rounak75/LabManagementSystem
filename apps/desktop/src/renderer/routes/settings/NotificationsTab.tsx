import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/lib/toast.store";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotifFormValues {
  notificationsEnabled: boolean;
  // SMS
  smsProvider: "Off" | "Test" | "Fast2SMS";
  smsApiKey: string;
  smsSenderId: string;
  smsTemplateReportReady: string;
  smsTemplateReportReadyUnpaid: string;
  smsTemplateVisitBooked: string;
  smsTemplatePaymentDue: string;
  smsTemplateHomeVisitReminder: string;
  // Email
  emailEnabled: boolean;
  emailSmtpHost: string;
  emailSmtpPort: number;
  emailSmtpUser: string;
  emailSmtpPassword: string;
  emailFromName: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [smsApiKeySaved, setSmsApiKeySaved] = useState(false);
  const [smtpPasswordSaved, setSmtpPasswordSaved] = useState(false);

  const { data: s } = useQuery({
    queryKey: ["settings"],
    queryFn: () => call<any>("settings:get"),
  });

  const { register, handleSubmit, reset, watch } = useForm<NotifFormValues>({
    defaultValues: {
      notificationsEnabled: false,
      smsProvider: "Off",
      smsApiKey: "",
      smsSenderId: "",
      smsTemplateReportReady: "",
      smsTemplateReportReadyUnpaid: "",
      smsTemplateVisitBooked: "",
      smsTemplatePaymentDue: "",
      smsTemplateHomeVisitReminder: "",
      emailEnabled: false,
      emailSmtpHost: "smtp.gmail.com",
      emailSmtpPort: 587,
      emailSmtpUser: "",
      emailSmtpPassword: "",
      emailFromName: "Golmuri Janch Ghar",
    },
  });

  useEffect(() => {
    if (!s) return;
    setSmsApiKeySaved(s.smsApiKey === "***");
    setSmtpPasswordSaved(s.emailSmtpPassword === "***");
    reset({
      notificationsEnabled: !!s.notificationsEnabled,
      smsProvider: s.smsProvider ?? "Off",
      smsApiKey: "",          // never pre-fill secrets
      smsSenderId: s.smsSenderId ?? "",
      smsTemplateReportReady: s.smsTemplateReportReady ?? "",
      smsTemplateReportReadyUnpaid: s.smsTemplateReportReadyUnpaid ?? "",
      smsTemplateVisitBooked: s.smsTemplateVisitBooked ?? "",
      smsTemplatePaymentDue: s.smsTemplatePaymentDue ?? "",
      smsTemplateHomeVisitReminder: s.smsTemplateHomeVisitReminder ?? "",
      emailEnabled: !!s.emailEnabled,
      emailSmtpHost: s.emailSmtpHost ?? "smtp.gmail.com",
      emailSmtpPort: s.emailSmtpPort ?? 587,
      emailSmtpUser: s.emailSmtpUser ?? "",
      emailSmtpPassword: "",  // never pre-fill secrets
      emailFromName: s.emailFromName ?? "Golmuri Janch Ghar",
    });
  }, [s, reset]);

  const save = useMutation({
    mutationFn: (v: NotifFormValues) =>
      call("settings:update", {
        notificationsEnabled: v.notificationsEnabled,
        smsProvider: v.smsProvider,
        smsApiKey: v.smsApiKey,            // empty string = keep existing
        smsSenderId: v.smsSenderId ? v.smsSenderId.toUpperCase().slice(0, 6) : "",
        smsTemplateReportReady: v.smsTemplateReportReady,
        smsTemplateReportReadyUnpaid: v.smsTemplateReportReadyUnpaid,
        smsTemplateVisitBooked: v.smsTemplateVisitBooked,
        smsTemplatePaymentDue: v.smsTemplatePaymentDue,
        smsTemplateHomeVisitReminder: v.smsTemplateHomeVisitReminder,
        emailEnabled: v.emailEnabled,
        emailSmtpHost: v.emailSmtpHost || "smtp.gmail.com",
        emailSmtpPort: Number(v.emailSmtpPort) || 587,
        emailSmtpUser: v.emailSmtpUser,
        emailSmtpPassword: v.emailSmtpPassword, // empty string = keep existing
        emailFromName: v.emailFromName || "Golmuri Janch Ghar",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Notification settings saved.");
    },
  });

  // ─── Test SMS ───────────────────────────────────────────────────────────────

  const [testSmsPhone, setTestSmsPhone] = useState("");
  const [showSmsPrompt, setShowSmsPrompt] = useState(false);

  const testSms = useMutation({
    mutationFn: (phone: string) =>
      call<{ ok: boolean; error?: string }>("notifications:sendTestSms", { phone }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Test SMS sent successfully.");
      else toast.error(`Test SMS failed: ${r.error ?? "unknown error"}`);
    },
  });

  function handleSendTestSms() {
    const trimmed = testSmsPhone.trim();
    if (!trimmed) { toast.error("Enter a phone number first."); return; }
    setShowSmsPrompt(false);
    testSms.mutate(trimmed);
  }

  // ─── Test Email ─────────────────────────────────────────────────────────────

  const [testEmail, setTestEmail] = useState("");
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);

  const testEmailMutation = useMutation({
    mutationFn: (email: string) =>
      call<{ ok: boolean; error?: string }>("notifications:sendTestEmail", { email }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Test email sent successfully.");
      else toast.error(`Test email failed: ${r.error ?? "unknown error"}`);
    },
  });

  function handleSendTestEmail() {
    const trimmed = testEmail.trim();
    if (!trimmed) { toast.error("Enter an email address first."); return; }
    setShowEmailPrompt(false);
    testEmailMutation.mutate(trimmed);
  }

  // ─── Derived state ──────────────────────────────────────────────────────────

  const smsProvider = watch("smsProvider");

  if (!s) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>

      <form onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-4">

        {/* ── Master switch ─────────────────────────────────────────────── */}
        <Card>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" {...register("notificationsEnabled")} className="h-4 w-4 accent-brand" />
            <span className="font-medium text-slate-700">Enable notifications</span>
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Master switch. When off, no SMS or email notifications will be sent regardless of other settings.
          </p>
        </Card>

        {/* ── SMS section ───────────────────────────────────────────────── */}
        <Card>
          <h2 className="mb-4 text-lg font-medium">SMS</h2>

          {/* Provider radio */}
          <div className="mb-4">
            <div className="mb-1 text-sm font-medium text-slate-700">Provider</div>
            <div className="flex gap-6">
              {(["Off", "Test", "Fast2SMS"] as const).map(p => (
                <label key={p} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="radio" value={p} {...register("smsProvider")} className="accent-brand" />
                  {p}
                </label>
              ))}
            </div>
            {smsProvider === "Test" && (
              <p className="mt-1 text-xs text-slate-500">
                Test mode writes messages to the app log instead of sending real SMS.
              </p>
            )}
          </div>

          {/* API key — only relevant for Fast2SMS */}
          {smsProvider === "Fast2SMS" && (
            <div className="mb-3 grid grid-cols-2 gap-3">
              <Input
                label="Fast2SMS API key"
                type="password"
                placeholder={smsApiKeySaved ? "(saved — leave blank to keep)" : "Paste API key…"}
                {...register("smsApiKey")}
              />
              <Input
                label="Sender ID (max 6 chars)"
                placeholder="LABGJG"
                maxLength={6}
                style={{ textTransform: "uppercase" }}
                {...register("smsSenderId")}
              />
            </div>
          )}

          {/* DLT template IDs */}
          <div className="mb-4">
            <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
              DLT Template IDs
            </div>
            <div className="grid grid-cols-1 gap-3">
              <Input label="Report ready (paid)"    {...register("smsTemplateReportReady")} />
              <Input label="Report ready (unpaid)"  {...register("smsTemplateReportReadyUnpaid")} />
              <Input label="Visit booked"           {...register("smsTemplateVisitBooked")} />
              <Input label="Payment reminder"       {...register("smsTemplatePaymentDue")} />
              <Input label="Home visit reminder"    {...register("smsTemplateHomeVisitReminder")} />
            </div>
          </div>

          {/* Test SMS */}
          {!showSmsPrompt ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowSmsPrompt(true)}
              disabled={testSms.isPending}
            >
              {testSms.isPending ? "Sending…" : "Send test SMS…"}
            </Button>
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Phone number"
                  placeholder="91XXXXXXXXXX"
                  value={testSmsPhone}
                  onChange={e => setTestSmsPhone(e.target.value)}
                />
              </div>
              <Button type="button" onClick={handleSendTestSms} disabled={testSms.isPending}>
                Send
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowSmsPrompt(false)}>
                Cancel
              </Button>
            </div>
          )}
        </Card>

        {/* ── Email section ─────────────────────────────────────────────── */}
        <Card>
          <h2 className="mb-4 text-lg font-medium">Email</h2>

          <label className="mb-4 flex items-center gap-3 text-sm">
            <input type="checkbox" {...register("emailEnabled")} className="h-4 w-4 accent-brand" />
            <span className="font-medium text-slate-700">Enable email notifications</span>
          </label>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <Input label="SMTP host"  defaultValue="smtp.gmail.com" {...register("emailSmtpHost")} />
            <Input label="Port"       type="number" defaultValue={587} {...register("emailSmtpPort")} />
            <Input
              label="Gmail address (username)"
              placeholder="lab@gmail.com"
              className="col-span-2"
              {...register("emailSmtpUser")}
            />
            <Input
              label="App password"
              type="password"
              placeholder={smtpPasswordSaved ? "(saved — leave blank to keep)" : "Google App Password…"}
              className="col-span-2"
              {...register("emailSmtpPassword")}
            />
            <Input
              label="From name"
              defaultValue="Golmuri Janch Ghar"
              className="col-span-2"
              {...register("emailFromName")}
            />
          </div>

          {/* Test email */}
          {!showEmailPrompt ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowEmailPrompt(true)}
              disabled={testEmailMutation.isPending}
            >
              {testEmailMutation.isPending ? "Sending…" : "Send test email…"}
            </Button>
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Email address"
                  type="email"
                  placeholder="you@example.com"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                />
              </div>
              <Button type="button" onClick={handleSendTestEmail} disabled={testEmailMutation.isPending}>
                Send
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowEmailPrompt(false)}>
                Cancel
              </Button>
            </div>
          )}
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

export default NotificationsTab;
