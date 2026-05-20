"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

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
      <div className="mt-4 bg-green-50 border border-green-200 p-4 rounded">
        <h2 className="font-semibold">Bill paid — thank you.</h2>
        <p className="text-sm text-slate-700 mt-1">
          {invoice.visitDisplayId} · ₹{invoice.total.toFixed(0)}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Pay your bill</h1>
        <p className="text-sm text-slate-500">
          {invoice.visitDisplayId} · {invoice.patientName}
        </p>
      </div>

      <div className="bg-white border rounded p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Amount due</span>
          <span className="text-2xl font-semibold">₹{invoice.due.toFixed(0)}</span>
        </div>
        {invoice.amountPaid > 0 && (
          <div className="mt-1 text-xs text-slate-500">
            Already paid: ₹{invoice.amountPaid.toFixed(0)} of ₹{invoice.total.toFixed(0)}
          </div>
        )}
      </div>

      {upiActive && (
        <div className="bg-white border rounded p-4">
          <h2 className="font-medium">Pay via UPI</h2>
          <p className="text-sm text-slate-600 mt-1">
            Scan the QR with any UPI app (GPay, PhonePe, Paytm) or tap the button below to open your UPI app directly.
          </p>
          <div className="mt-3 flex flex-col items-center gap-2">
            <QRCodeSVG
              value={buildUpiUri(lab.upiVpa!, lab.upiPayeeName!, invoice.due, `Bill ${invoice.visitDisplayId}`)}
              size={196}
              level="M"
            />
            <a
              href={buildUpiUri(lab.upiVpa!, lab.upiPayeeName!, invoice.due, `Bill ${invoice.visitDisplayId}`)}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
            >
              Open UPI app
            </a>
            <div className="text-xs text-slate-500 break-all">
              UPI ID: {lab.upiVpa}
            </div>
          </div>
        </div>
      )}

      {razorpayActive && (
        <div className="bg-white border rounded p-4">
          <h2 className="font-medium">Pay via card / netbanking</h2>
          <a
            href={invoice.razorpayLink!}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block px-4 py-2 bg-blue-600 text-white rounded text-sm"
          >
            Open Razorpay
          </a>
        </div>
      )}

      {!upiActive && !razorpayActive && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded text-sm">
          Online payment isn't set up yet. Please call the lab at
          <a className="text-blue-700 ml-1" href="tel:6202924306">6202924306</a> to pay.
        </div>
      )}

      <div className="bg-white border rounded p-4">
        <h2 className="font-medium text-sm">Already paid?</h2>
        <p className="text-sm text-slate-600 mt-1">
          If you've paid recently and the status hasn't updated yet, let the lab know.
          They'll check and update your bill manually.
        </p>
        {claimSent ? (
          <p className="mt-2 text-sm text-green-700">Thanks — the lab has been notified.</p>
        ) : (
          <button
            onClick={handleAlreadyPaid}
            className="mt-2 px-3 py-1.5 text-sm bg-slate-200 hover:bg-slate-300 rounded"
          >
            I've already paid
          </button>
        )}
      </div>
    </div>
  );
}
