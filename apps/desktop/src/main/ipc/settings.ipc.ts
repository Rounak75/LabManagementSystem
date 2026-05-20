import { app as electronApp } from "electron";
import { copyFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join, extname } from "path";
import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireAdmin, requireSession } from "@main/session";
import { audit } from "@main/services/audit.service";
import { migrateLogoToDataUri } from "@main/services/report.service";
import { encryptSecret } from "@main/services/crypto.service";

// ─── settings:get ────────────────────────────────────────────────────────────

export async function getSettings() {
  requireSession();
  const s = await prisma().labSettings.findUnique({ where: { id: "singleton" } });
  if (!s) throw new Error("NOT_FOUND");
  // Never expose plaintext secrets to the renderer.
  // Return "***" as a sentinel meaning "a value is saved — leave blank to keep".
  return {
    ...s,
    smsApiKey: s.smsApiKey ? "***" : null,
    emailSmtpPassword: s.emailSmtpPassword ? "***" : null,
    razorpayKeySecret: s.razorpayKeySecret ? "***" : null,
    razorpayWebhookSecret: s.razorpayWebhookSecret ? "***" : null,
    supabaseServiceKey: s.supabaseServiceKey ? "***" : null,
  };
}

register("settings:get", getSettings);

// ─── settings:update ─────────────────────────────────────────────────────────

/** Non-secret notification fields that are passed through as-is. */
const PLAIN_NOTIFICATION_FIELDS = [
  "notificationsEnabled",
  "smsProvider",
  "smsSenderId",
  "smsTemplateReportReady",
  "smsTemplateReportReadyUnpaid",
  "smsTemplateVisitBooked",
  "smsTemplatePaymentDue",
  "smsTemplateHomeVisitReminder",
  "emailEnabled",
  "emailSmtpHost",
  "emailSmtpPort",
  "emailSmtpUser",
  "emailFromName",
] as const;

export async function updateSettings(input: any) {
  requireAdmin();

  // Build a clean update payload — only pass fields that were provided.
  const data: Record<string, unknown> = {};

  // Pass-through non-secret fields present in the input.
  for (const k of PLAIN_NOTIFICATION_FIELDS) {
    if (input[k] !== undefined) data[k] = input[k];
  }

  // Pass-through any other (non-notification) fields the caller supplied,
  // excluding the two secret fields which need special handling.
  for (const [k, v] of Object.entries(input)) {
    if (
      !(PLAIN_NOTIFICATION_FIELDS as readonly string[]).includes(k) &&
      k !== "smsApiKey" &&
      k !== "emailSmtpPassword" &&
      k !== "razorpayKeySecret" &&
      k !== "razorpayWebhookSecret" &&
      k !== "supabaseServiceKey"
    ) {
      data[k] = v;
    }
  }

  // Secrets: only update when a non-empty new value is provided.
  // An empty string from the renderer means "no change — keep the existing encrypted value."
  if (typeof input.smsApiKey === "string" && input.smsApiKey.length > 0 && input.smsApiKey !== "***") {
    data.smsApiKey = encryptSecret(input.smsApiKey);
  }
  if (typeof input.emailSmtpPassword === "string" && input.emailSmtpPassword.length > 0 && input.emailSmtpPassword !== "***") {
    data.emailSmtpPassword = encryptSecret(input.emailSmtpPassword);
  }
  if (typeof input.razorpayKeySecret === "string" && input.razorpayKeySecret.length > 0 && input.razorpayKeySecret !== "***") {
    data.razorpayKeySecret = encryptSecret(input.razorpayKeySecret);
  }
  if (typeof input.razorpayWebhookSecret === "string" && input.razorpayWebhookSecret.length > 0 && input.razorpayWebhookSecret !== "***") {
    data.razorpayWebhookSecret = encryptSecret(input.razorpayWebhookSecret);
  }
  if (typeof input.supabaseServiceKey === "string" && input.supabaseServiceKey.length > 0 && input.supabaseServiceKey !== "***") {
    data.supabaseServiceKey = encryptSecret(input.supabaseServiceKey);
  }

  const s = await prisma().labSettings.update({ where: { id: "singleton" }, data });
  await audit("UPDATE", "LabSettings", "singleton");

  return {
    ...s,
    smsApiKey: s.smsApiKey ? "***" : null,
    emailSmtpPassword: s.emailSmtpPassword ? "***" : null,
    razorpayKeySecret: s.razorpayKeySecret ? "***" : null,
    razorpayWebhookSecret: s.razorpayWebhookSecret ? "***" : null,
    supabaseServiceKey: s.supabaseServiceKey ? "***" : null,
  };
}

register("settings:update", updateSettings);

register("settings:uploadLogo", async (p: { sourcePath: string }) => {
  requireAdmin();
  const ext = extname(p.sourcePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg"].includes(ext)) throw new Error("INVALID_INPUT");
  const stat = statSync(p.sourcePath);
  if (stat.size > 256 * 1024) throw new Error("FILE_TOO_LARGE");

  const dir = join(electronApp.getPath("userData"), "assets");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dest = join(dir, `logo${ext}`);
  copyFileSync(p.sourcePath, dest);

  // Persist the logo as a base64 data URI so the PDF main-process renderer
  // (react-pdf) can load it reliably. The copied file under userData/assets
  // is kept as a reference / backup but is no longer the source of truth.
  const dataUri = migrateLogoToDataUri(dest);
  await prisma().labSettings.update({ where: { id: "singleton" }, data: { labLogo: dataUri } });
  await audit("SETTINGS_LOGO_UPDATED", "LabSettings", "singleton");
  return { path: dest };
});

register("settings:removeLogo", async () => {
  requireAdmin();
  await prisma().labSettings.update({ where: { id: "singleton" }, data: { labLogo: null } });
  await audit("SETTINGS_LOGO_REMOVED", "LabSettings", "singleton");
  return { ok: true as const };
});
