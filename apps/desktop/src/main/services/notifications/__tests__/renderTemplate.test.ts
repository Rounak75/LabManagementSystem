import { describe, it, expect } from "vitest";
import { renderMessage } from "../render-template";
import type { RenderContext } from "../types";

const ctx: RenderContext = {
  patientName: "Ravi Kumar",
  visitDate: "12 May 2026",
  amount: 850,
  patientId: "LAB-2026-00001",
  visitId: "v1",
  testList: ["CBC", "Urea"],
};

const dltIds = {
  smsTemplateReportReady: "1707111111111111111",
  smsTemplateReportReadyUnpaid: "1707222222222222222",
  smsTemplateVisitBooked: "1707333333333333333",
  smsTemplatePaymentDue: "1707444444444444444",
  smsTemplateHomeVisitReminder: "1707555555555555555",
};

describe("render-template", () => {
  it("renders ReportReady paid SMS", () => {
    const m = renderMessage("ReportReady", "SMS", ctx, { paid: true, dltIds });
    expect(m.smsBody).toContain("Ravi Kumar");
    expect(m.smsBody).toContain("12 May 2026");
    expect(m.smsVariablesString).toBe("Ravi Kumar|12 May 2026");
    expect(m.dltTemplateId).toBe(dltIds.smsTemplateReportReady);
  });

  it("renders ReportReady unpaid SMS with amount", () => {
    const m = renderMessage("ReportReady", "SMS", ctx, { paid: false, dltIds });
    expect(m.smsBody).toContain("Rs 850");
    expect(m.smsVariablesString).toBe("Ravi Kumar|12 May 2026|850");
    expect(m.dltTemplateId).toBe(dltIds.smsTemplateReportReadyUnpaid);
  });

  it("renders VisitBooked SMS", () => {
    const m = renderMessage("VisitBooked", "SMS", ctx, { paid: false, dltIds });
    expect(m.smsVariablesString).toBe("Ravi Kumar|12 May 2026");
    expect(m.dltTemplateId).toBe(dltIds.smsTemplateVisitBooked);
  });

  it("renders PaymentDue SMS with amount", () => {
    const m = renderMessage("PaymentDue", "SMS", ctx, { paid: false, dltIds });
    expect(m.smsVariablesString).toBe("Ravi Kumar|12 May 2026|850");
    expect(m.dltTemplateId).toBe(dltIds.smsTemplatePaymentDue);
  });

  it("renders HomeVisitReminder SMS with visitTime", () => {
    const m = renderMessage("HomeVisitReminder", "SMS",
      { ...ctx, visitTime: "9:00 AM" },
      { paid: false, dltIds }
    );
    expect(m.smsVariablesString).toBe("Ravi Kumar|12 May 2026|9:00 AM");
    expect(m.dltTemplateId).toBe(dltIds.smsTemplateHomeVisitReminder);
  });

  it("truncates patient names to 20 characters", () => {
    const m = renderMessage("ReportReady", "SMS",
      { ...ctx, patientName: "A".repeat(50) },
      { paid: true, dltIds }
    );
    const namePart = m.smsVariablesString!.split("|")[0];
    expect(namePart!.length).toBe(20);
  });

  it("renders ReportReady email with subject + plain + html + tests", () => {
    const m = renderMessage("ReportReady", "Email", ctx, { paid: true, dltIds });
    expect(m.subject).toContain("12 May 2026");
    expect(m.emailText).toContain("Ravi Kumar");
    expect(m.emailText).toContain("CBC");
    expect(m.emailText).toContain("Urea");
    expect(m.emailHtml).toContain("<html");
    expect(m.emailHtml).toContain("Ravi Kumar");
  });

  it("ReportReady with paymentShortUrl uses the WithLink template", () => {
    const withLinkDltIds = {
      ...dltIds,
      smsTemplateReportReadyWithLink: "DLT-WITH-LINK",
      smsTemplatePaymentLink: "DLT-LINK",
    };
    const out = renderMessage(
      "ReportReady",
      "SMS",
      { ...ctx, paymentShortUrl: "https://rzp.io/l/X" },
      { paid: false, dltIds: withLinkDltIds }
    );
    expect(out.dltTemplateId).toBe("DLT-WITH-LINK");
    expect(out.smsBody).toContain("https://rzp.io/l/X");
  });

  it("PaymentLink purpose renders SMS with the payment link template", () => {
    const paymentLinkDltIds = {
      ...dltIds,
      smsTemplateReportReadyWithLink: "",
      smsTemplatePaymentLink: "DLT-LINK",
    };
    const out = renderMessage(
      "PaymentLink",
      "SMS",
      { ...ctx, amount: 250, paymentShortUrl: "https://rzp.io/l/Y" },
      { paid: false, dltIds: paymentLinkDltIds }
    );
    expect(out.dltTemplateId).toBe("DLT-LINK");
    expect(out.smsBody).toContain("https://rzp.io/l/Y");
  });
});
