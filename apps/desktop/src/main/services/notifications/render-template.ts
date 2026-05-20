import type {
  NotificationChannel,
  NotificationPurpose,
  RenderContext,
  RenderedMessage,
} from "./types";

export interface DltTemplateIds {
  smsTemplateReportReady: string | null;
  smsTemplateReportReadyUnpaid: string | null;
  smsTemplateReportReadyWithLink: string | null;
  smsTemplateVisitBooked: string | null;
  smsTemplatePaymentDue: string | null;
  smsTemplateHomeVisitReminder: string | null;
  smsTemplatePaymentLink: string | null;
}

export interface RenderOpts {
  paid: boolean;
  dltIds: Partial<DltTemplateIds>;
}

const NAME_MAX = 20;
const trunc = (s: string) => (s.length > NAME_MAX ? s.slice(0, NAME_MAX) : s);
const rupees = (n: number) => Math.round(n).toString();
const pipe = (...parts: (string | number)[]) => parts.map(String).join("|");

export function renderMessage(
  purpose: NotificationPurpose,
  channel: NotificationChannel,
  ctx: RenderContext,
  opts: RenderOpts
): RenderedMessage {
  const name = trunc(ctx.patientName);

  if (channel === "SMS") {
    switch (purpose) {
      case "ReportReady":
        if (ctx.paymentShortUrl) {
          const amt = ctx.amount ?? 0;
          return {
            smsBody:
              `Hello ${name}, your report is ready. ` +
              `Pay Rs.${rupees(amt)}: ${ctx.paymentShortUrl} - Golmuri Janch Ghar`,
            smsVariablesString: pipe(name, rupees(amt), ctx.paymentShortUrl),
            dltTemplateId: opts.dltIds.smsTemplateReportReadyWithLink ?? "",
          };
        }
        if (opts.paid) {
          return {
            smsBody:
              `Dear ${name}, your lab report dated ${ctx.visitDate} is ready. ` +
              `Check email for PDF or collect at Golmuri Janch Ghar, Golmuri Chowk. -GOLMRI`,
            smsVariablesString: pipe(name, ctx.visitDate),
            dltTemplateId: opts.dltIds.smsTemplateReportReady ?? "",
          };
        } else {
          const amt = ctx.amount ?? 0;
          return {
            smsBody:
              `Dear ${name}, your lab report dated ${ctx.visitDate} is ready. ` +
              `Please complete payment of Rs ${rupees(amt)} at Golmuri Janch Ghar to receive PDF. -GOLMRI`,
            smsVariablesString: pipe(name, ctx.visitDate, rupees(amt)),
            dltTemplateId: opts.dltIds.smsTemplateReportReadyUnpaid ?? "",
          };
        }

      case "VisitBooked":
        return {
          smsBody:
            `Dear ${name}, your visit at Golmuri Janch Ghar is confirmed for ${ctx.visitDate}. ` +
            `Address: Main Road, Golmuri Chowk, Jamshedpur. Ph 6202924306. -GOLMRI`,
          smsVariablesString: pipe(name, ctx.visitDate),
          dltTemplateId: opts.dltIds.smsTemplateVisitBooked ?? "",
        };

      case "PaymentDue": {
        const amt = ctx.amount ?? 0;
        return {
          smsBody:
            `Dear ${name}, your lab report from ${ctx.visitDate} is ready. ` +
            `Please complete payment of Rs ${rupees(amt)} at Golmuri Janch Ghar to receive PDF. -GOLMRI`,
          smsVariablesString: pipe(name, ctx.visitDate, rupees(amt)),
          dltTemplateId: opts.dltIds.smsTemplatePaymentDue ?? "",
        };
      }

      case "HomeVisitReminder":
        return {
          smsBody:
            `Dear ${name}, home visit reminder for ${ctx.visitDate} at ${ctx.visitTime ?? "TBD"}. ` +
            `Fasting required if blood test. -Golmuri Janch Ghar`,
          smsVariablesString: pipe(name, ctx.visitDate, ctx.visitTime ?? ""),
          dltTemplateId: opts.dltIds.smsTemplateHomeVisitReminder ?? "",
        };

      case "PaymentLink": {
        const amt = ctx.amount ?? 0;
        const url = ctx.paymentShortUrl ?? "";
        return {
          smsBody:
            `Pay Rs.${rupees(amt)} for Golmuri Janch Ghar: ${url} (valid 7d). - Golmuri Janch Ghar`,
          smsVariablesString: pipe(rupees(amt), url),
          dltTemplateId: opts.dltIds.smsTemplatePaymentLink ?? "",
        };
      }
    }
    // TypeScript exhaustiveness safety — all cases above return
    throw new Error("unreachable");
  }

  // Email
  if (purpose === "HomeVisitReminder") {
    const time = ctx.visitTime ?? "the scheduled slot";
    const text =
      `Dear ${ctx.patientName},\n\n` +
      `Friendly reminder: our phlebotomist is visiting tomorrow on ${ctx.visitDate} (${time}) to collect your sample.\n\n` +
      `If a fasting blood test is part of your visit, please don't eat or drink anything except water for 8–10 hours beforehand.\n\n` +
      `To reschedule, call 6202924306.\n\n` +
      `Regards,\nGolmuri Janch Ghar\n`;
    const html =
      `<p>Dear ${ctx.patientName},</p>` +
      `<p>Friendly reminder: our phlebotomist is visiting <b>tomorrow</b> on <b>${ctx.visitDate}</b> (${time}) to collect your sample.</p>` +
      `<p>If a fasting blood test is part of your visit, please don't eat or drink anything except water for 8–10 hours beforehand.</p>` +
      `<p>To reschedule, call <a href="tel:6202924306">6202924306</a>.</p>` +
      `<p>Regards,<br/>Golmuri Janch Ghar</p>`;
    return {
      subject: `Home visit tomorrow — Golmuri Janch Ghar`,
      emailText: text,
      emailHtml: html,
    };
  }

  if (purpose === "ReportReady") {
    const testLines = (ctx.testList ?? []).map((t) => `  • ${t}`).join("\n");
    const text =
      `Dear ${ctx.patientName},\n\n` +
      `Your lab report from your visit on ${ctx.visitDate} is attached as a PDF.\n\n` +
      `Tests:\n${testLines}\n\n` +
      `If you have questions, please call us at 6202924306.\n\n` +
      `Lab timings: 08:00 AM – 01:00 PM, 06:00 PM – 08:00 PM (Sun evening closed)\n\n` +
      `Regards,\nGolmuri Janch Ghar\n` +
      `Main Road, Golmuri Chowk, Jamshedpur\n`;
    const html =
      `<html><body style="font-family:sans-serif;color:#222;">` +
      `<p>Dear ${ctx.patientName},</p>` +
      `<p>Your lab report from your visit on <b>${ctx.visitDate}</b> is attached as a PDF.</p>` +
      `<p><b>Tests:</b><ul>${(ctx.testList ?? []).map((t) => `<li>${t}</li>`).join("")}</ul></p>` +
      `<p>If you have questions, please call <a href="tel:6202924306">6202924306</a>.</p>` +
      `<p style="color:#666;font-size:0.9em;">Lab timings: 08:00 AM – 01:00 PM, 06:00 PM – 08:00 PM (Sun evening closed)</p>` +
      `<p>Regards,<br/>Golmuri Janch Ghar<br/>Main Road, Golmuri Chowk, Jamshedpur</p>` +
      `</body></html>`;
    return {
      subject: `Your lab report from Golmuri Janch Ghar — ${ctx.visitDate}`,
      emailText: text,
      emailHtml: html,
    };
  }

  // Non-ReportReady emails are not used in Phase 3a
  throw new Error(`Email rendering not defined for purpose ${purpose}`);
}
