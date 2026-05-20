import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
  createTransport: createTransportMock,
}));

vi.mock("@main/db", () => ({
  prisma: () => ({
    labSettings: {
      findFirst: async () => ({
        notificationsEnabled: true,
        emailEnabled: true,
        emailSmtpHost: "smtp.gmail.com",
        emailSmtpPort: 587,
        emailSmtpUser: "lab@gmail.com",
        emailSmtpPassword: "v1:" + Buffer.from("plainpass").toString("base64"),
        emailFromName: "Golmuri Janch Ghar",
        smsProvider: "Test",
      }),
    },
    visit: {
      findUnique: async () => ({
        id: "v1",
        visitDate: new Date("2026-05-12"),
        patient: { name: "Ravi", patientId: "LAB-2026-00001" },
        invoice: { paymentStatus: "Paid", total: 850 },
        visitTests: [{ test: { name: "CBC" } }],
      }),
    },
  }),
}));

vi.mock("../../../crypto.service", () => ({
  decryptSecret: (_s: string) => "plainpass",
}));

// Mock the PDF pipeline — buildReportData + renderReportPdf are the actual
// functions called internally; we mock them so no real DB / react-pdf needed.
vi.mock("../../../report.service", () => ({
  buildReportData: async () => ({ stub: "report-data" }),
}));

vi.mock("../../../pdf.service", () => ({
  renderReportPdf: async () => Buffer.from("pdf-bytes"),
}));

import { send } from "../email.sender";

describe("email.sender", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
  });

  it("sends MIME with PDF attachment and returns ok", async () => {
    sendMailMock.mockResolvedValueOnce({ messageId: "<abc@gmail>" });

    const res = await send({
      id: "n1",
      visitId: "v1",
      patientId: "p1",
      channel: "Email",
      recipient: "ravi@gmail.com",
      purpose: "ReportReady",
      subject: null,
    });

    expect(res.ok).toBe(true);
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 587,
        auth: { user: "lab@gmail.com", pass: "plainpass" },
      })
    );
    const call = sendMailMock.mock.calls[0]![0];
    expect(call.from).toContain("Golmuri Janch Ghar");
    expect(call.to).toBe("ravi@gmail.com");
    expect(call.subject).toContain("12 May 2026");
    expect(call.text).toContain("Ravi");
    expect(call.html).toContain("Ravi");
    expect(call.attachments[0].filename).toBe("LAB-2026-00001-v1.pdf");
    expect(call.attachments[0].content).toEqual(Buffer.from("pdf-bytes"));
  });

  it("maps SMTP auth error to non-retryable", async () => {
    sendMailMock.mockRejectedValueOnce(
      Object.assign(new Error("auth"), { responseCode: 535 })
    );
    const res = await send({
      id: "n2",
      visitId: "v1",
      patientId: "p1",
      channel: "Email",
      recipient: "x@y.com",
      purpose: "ReportReady",
      subject: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryable).toBe(false);
  });

  it("maps SMTP 421 greylist to retryable", async () => {
    sendMailMock.mockRejectedValueOnce(
      Object.assign(new Error("greylist"), { responseCode: 421 })
    );
    const res = await send({
      id: "n3",
      visitId: "v1",
      patientId: "p1",
      channel: "Email",
      recipient: "x@y.com",
      purpose: "ReportReady",
      subject: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryable).toBe(true);
  });
});
