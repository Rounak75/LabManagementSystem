"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Band,
  BandBar,
  BandCard,
  Card,
  Container,
  Fact,
  Note,
  btnPrimary,
  btnSecondary,
} from "@portal/components/ui";
import {
  ArrowRight,
  Check,
  Info,
  Phone,
  Wallet,
} from "@portal/components/icons";

interface Invoice {
  id: string;
  visitDisplayId: string;
  patientName: string;
  total: number;
  amountPaid: number;
  paymentStatus: string;
  due: number;
  razorpayLink: string | null;
}
interface Lab {
  upiVpa: string | null;
  upiPayeeName: string | null;
  preferredGateway: "UPI" | "Razorpay";
}

function buildUpiUri(vpa: string, payeeName: string, amount: number, note: string): string {
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

export function PayClient({ invoice, lab }: { invoice: Invoice; lab: Lab }) {
  const [claimSent, setClaimSent] = useState(false);

  const upiActive = lab.preferredGateway === "UPI" && lab.upiVpa && lab.upiPayeeName;
  const razorpayActive = lab.preferredGateway === "Razorpay" && invoice.razorpayLink;

  async function handleAlreadyPaid() {
    await fetch("/api/payment-claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId: invoice.id }),
    });
    setClaimSent(true);
  }

  if (invoice.paymentStatus === "Paid") {
    return (
      <>
        <Band waves className="pb-20">
          <Container>
            <BandBar back={{ href: "/invoices", label: "Back to bills" }} title="Bill paid" />
            <div className="pb-4 pt-6 text-center">
              <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-band ring-1 ring-inset ring-white/25">
                <Check size={30} />
              </span>
              <p className="mt-5 font-heading text-[24px] font-extrabold tracking-tighter text-band">
                Thank you
              </p>
            </div>
          </Container>
        </Band>

        <Container>
          <Card className="mx-auto -mt-10 max-w-md p-6">
            <div className="grid grid-cols-2 gap-4">
              <Fact label="Bill" value={<span className="font-mono num">{invoice.visitDisplayId}</span>} />
              <Fact
                label="Amount"
                align="right"
                value={<span className="font-mono num">₹{invoice.total.toFixed(0)}</span>}
              />
            </div>
          </Card>
        </Container>
      </>
    );
  }

  const upiUri = upiActive
    ? buildUpiUri(
        lab.upiVpa!,
        lab.upiPayeeName!,
        invoice.due,
        `Bill ${invoice.visitDisplayId}`
      )
    : null;

  return (
    <>
      {/* ─── Bill summary band ────────────────────────────────────────── */}
      <Band waves className="pb-14">
        <Container>
          <BandBar back={{ href: "/invoices", label: "Back to bills" }} title="Pay your bill" />

          <BandCard className="mt-4">
            <div className="rounded-[20px] bg-elev p-4">
              <div className="flex items-center gap-3.5">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Wallet size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-text">
                    Golmuri Janch Ghar
                  </p>
                  <p className="mt-0.5 truncate font-mono num text-[12.5px] text-muted">
                    Bill {invoice.visitDisplayId}
                  </p>
                </div>
              </div>

              {invoice.amountPaid > 0 && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                  <span className="text-[12.5px] text-muted">Already paid</span>
                  <span className="font-mono num text-[13px] font-medium text-text">
                    ₹{invoice.amountPaid.toFixed(0)} of ₹{invoice.total.toFixed(0)}
                  </span>
                </div>
              )}

              {/* The one number that matters, on the brand surface. */}
              <div className="band mt-2.5 flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5">
                <span className="text-[13px] font-medium text-band/80">
                  Amount due
                </span>
                <span className="font-mono num text-[22px] font-semibold text-band">
                  ₹{invoice.due.toFixed(0)}
                </span>
              </div>
            </div>
          </BandCard>
        </Container>
      </Band>

      <Container>
        <div className="mx-auto mt-8 max-w-md space-y-4">
          {/* ─── UPI ───────────────────────────────────────────────────── */}
          {upiActive && upiUri && (
            <>
              <Note icon={<Info size={17} />}>
                Scan this code with any UPI app — GPay, PhonePe, Paytm — or tap
                the button below to open your app with the amount already filled
                in.
              </Note>

              <Card className="p-6">
                <div className="flex justify-center">
                  <div className="rounded-2xl bg-white p-4 shadow-card">
                    <QRCodeSVG value={upiUri} size={196} level="M" />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                  <span className="shrink-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                    UPI ID
                  </span>
                  <span className="min-w-0 break-all text-right font-mono text-[13px] text-text">
                    {lab.upiVpa}
                  </span>
                </div>

                <a href={upiUri} className={`${btnPrimary} mt-4 w-full`}>
                  Open UPI app
                  <ArrowRight size={16} />
                </a>
              </Card>
            </>
          )}

          {/* ─── Razorpay ──────────────────────────────────────────────── */}
          {razorpayActive && (
            <Card className="p-6">
              <p className="font-heading text-[15.5px] font-bold tracking-snug text-text">
                Pay by card or netbanking
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                You’ll be taken to Razorpay’s secure page to finish the payment.
              </p>
              <a
                href={invoice.razorpayLink!}
                target="_blank"
                rel="noreferrer"
                className={`${btnPrimary} mt-4 w-full`}
              >
                Open Razorpay
                <ArrowRight size={16} />
              </a>
            </Card>
          )}

          {/* ─── No gateway configured ─────────────────────────────────── */}
          {!upiActive && !razorpayActive && (
            <Card className="p-6">
              <Note tone="notice">
                Online payment isn’t set up yet. Please call the lab to pay.
              </Note>
              <a
                href="tel:6202924306"
                className={`${btnPrimary} mt-4 w-full font-mono num`}
              >
                <Phone size={16} />
                6202924306
              </a>
            </Card>
          )}

          {/* ─── Bill facts ───────────────────────────────────────────── */}
          <Card className="p-5">
            <div className="grid grid-cols-3 gap-3">
              <Fact label="Patient" value={invoice.patientName || "—"} />
              <Fact
                label="Bill"
                value={<span className="font-mono num">{invoice.visitDisplayId}</span>}
              />
              <Fact label="Status" align="right" value={invoice.paymentStatus} />
            </div>
          </Card>

          {/* ─── Already paid ─────────────────────────────────────────── */}
          <Card className="p-5">
            <p className="font-heading text-[14.5px] font-bold tracking-snug text-text">
              Already paid?
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              If you’ve paid recently and the status hasn’t updated yet, let the
              lab know. They’ll check and update your bill manually.
            </p>
            {claimSent ? (
              <p className="mt-4 flex items-center gap-2 rounded-2xl bg-ok-soft px-4 py-3 text-[13px] font-medium text-ok">
                <Check size={16} />
                Thanks — the lab has been notified.
              </p>
            ) : (
              <button onClick={handleAlreadyPaid} className={`${btnSecondary} mt-4 w-full`}>
                I’ve already paid
              </button>
            )}
          </Card>
        </div>
      </Container>
    </>
  );
}
