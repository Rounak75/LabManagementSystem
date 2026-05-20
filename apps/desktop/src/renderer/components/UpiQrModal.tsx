import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/lib/toast.store";
import { buildUpiUri, maskVpa } from "@/lib/upi";

interface Props {
  invoiceId: string;
  amount: number;
  vpa: string;
  payeeName: string;
  onMarkReceived: () => void;
  onClose: () => void;
  marking: boolean;
}

export function UpiQrModal({ invoiceId, amount, vpa, payeeName, onMarkReceived, onClose, marking }: Props) {
  const toast = useToast();
  const uri = buildUpiUri({
    vpa,
    payeeName,
    amount,
    invoiceId,
    note: `Lab visit ${invoiceId}`,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">UPI payment</h2>

        <div className="mt-4 text-center">
          <div className="text-3xl font-bold text-slate-900">₹{amount.toFixed(2)}</div>
          <div className="mt-1 text-sm text-slate-600">
            {payeeName} · <span className="font-mono">{maskVpa(vpa)}</span>
          </div>
        </div>

        <div className="mt-4 flex justify-center rounded-md border border-slate-200 bg-white p-4">
          <QRCodeSVG value={uri} size={224} level="M" />
        </div>

        <p className="mt-3 text-center text-sm text-slate-600">
          Scan with any UPI app (PhonePe, GPay, Paytm, BHIM…)
        </p>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500">Show raw UPI link (for testing)</summary>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-slate-100 px-2 py-1 text-xs">{uri}</code>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { navigator.clipboard.writeText(uri); toast.success("Copied."); }}
            >
              Copy
            </Button>
          </div>
        </details>

        <p className="mt-4 text-center text-xs text-slate-500">
          Only click &quot;Mark received&quot; after you see the payment in your UPI app.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={marking}>
            Cancel
          </Button>
          <Button type="button" onClick={onMarkReceived} disabled={marking}>
            {marking ? "Marking…" : "Mark received"}
          </Button>
        </div>
      </div>
    </div>
  );
}
