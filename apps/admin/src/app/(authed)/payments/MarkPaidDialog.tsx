"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/format";

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-lg p-5 max-w-sm w-full">
        <h3 className="font-semibold mb-1">Mark UPI received</h3>
        <p className="text-sm text-gray-600 mb-3">
          Outstanding: <strong>{formatINR(outstanding)}</strong>
        </p>
        <label className="block text-sm mb-3">
          Amount received (₹)
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        <label className="block text-sm mb-3">
          UPI reference (last 4 digits, optional)
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full border rounded px-3 py-2 mt-1"
          />
        </label>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border rounded py-2 text-sm">Cancel</button>
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
            className="flex-1 bg-green-600 text-white rounded py-2 text-sm font-medium disabled:bg-green-300"
          >
            {pending ? "Saving…" : "Mark received"}
          </button>
        </div>
      </div>
    </div>
  );
}
