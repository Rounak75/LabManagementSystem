"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/format";
import { Dialog } from "@/components/Dialog";

export function MarkPaidDialog({
  invoiceId,
  total,
  amountPaid,
  onClose,
}: {
  invoiceId: string;
  total: number;
  amountPaid: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const outstanding = total - amountPaid;
  const [amount, setAmount] = useState(String(outstanding));
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog title="Mark UPI received" onClose={onClose}>
        <p className="mb-3 text-sm text-slate-600">
          Outstanding: <strong className="text-slate-900">{formatINR(outstanding)}</strong>
        </p>
        <label className="mb-3 block">
          <span className="field-label">Amount received (₹)</span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input mt-1.5"
          />
        </label>
        <label className="mb-3 block">
          <span className="field-label">UPI reference (last 4 digits, optional)</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="input mt-1.5"
          />
        </label>
        {error && <p className="mb-2 text-sm font-medium text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            disabled={pending}
            onClick={() => {
              setError(null);
              const amt = Number(amount);
              if (!amt || amt <= 0) {
                setError("Enter a valid amount.");
                return;
              }
              startTransition(async () => {
                const r = await fetch("/api/payments/mark-received", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ invoice_id: invoiceId, amount: amt, reference: reference || null }),
                });
                if (!r.ok) {
                  setError("Could not record payment. Try again.");
                  return;
                }
                router.refresh();
                onClose();
              });
            }}
            className="btn-success flex-1"
          >
            {pending ? "Saving…" : "Mark received"}
          </button>
        </div>
    </Dialog>
  );
}
