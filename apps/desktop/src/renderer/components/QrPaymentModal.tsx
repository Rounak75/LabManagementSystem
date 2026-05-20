import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { useToast } from "@/lib/toast.store";

export interface QrPaymentModalProps {
  invoiceId: string;
  qrImageUrl: string;
  amount: number;
  expiresAt: Date;
  onClose: () => void;
}

function useCountdown(expiresAt: Date) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(prev => {
        const next = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
        if (next <= 0) clearInterval(t);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const label = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return { remaining, label };
}

export function QrPaymentModal({
  invoiceId,
  qrImageUrl,
  amount,
  expiresAt,
  onClose,
}: QrPaymentModalProps) {
  const toast = useToast();
  const [paid, setPaid] = useState(false);
  const closedRef = useRef(false);
  const { remaining, label: countdownLabel } = useCountdown(expiresAt);

  // TanStack Query — poll invoice status every 2 seconds
  const { data: invoiceData, refetch } = useQuery({
    queryKey: ["invoices:get", invoiceId],
    queryFn: () =>
      call<{ paymentStatus: string }>("invoices:get", { id: invoiceId }),
    refetchInterval: 2_000,
  });

  // Detect Paid transition
  useEffect(() => {
    if (invoiceData?.paymentStatus === "Paid" && !paid && !closedRef.current) {
      setPaid(true);
      setTimeout(() => {
        if (!closedRef.current) {
          closedRef.current = true;
          onClose();
        }
      }, 3000);
    }
  }, [invoiceData?.paymentStatus, paid, onClose]);

  // 5-second background poll via payments:checkNow
  useEffect(() => {
    const t = setInterval(() => {
      call("payments:checkNow", { invoiceId }).catch(() => {});
    }, 5_000);
    return () => clearInterval(t);
  }, [invoiceId]);

  // Escape key to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !paid) {
        closedRef.current = true;
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, paid]);

  const handleCheckNow = async () => {
    try {
      await call("payments:checkNow", { invoiceId });
      await refetch();
    } catch {
      // error already toasted by call()
    }
  };

  const handleCancelQr = async () => {
    const confirmed = window.confirm(
      "Cancel this QR code? The customer will not be able to pay using it."
    );
    if (!confirmed) return;
    try {
      await call("payments:cancelQr", { invoiceId });
      toast.info("QR code cancelled.");
      closedRef.current = true;
      onClose();
    } catch {
      // error already toasted by call()
    }
  };

  const handleClose = () => {
    closedRef.current = true;
    onClose();
  };

  const expired = remaining <= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={!paid ? handleClose : undefined}
    >
      <div
        role="dialog"
        aria-label="QR Payment"
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Pay via QR</h2>
          {!paid && (
            <button
              type="button"
              aria-label="Close"
              className="text-slate-400 hover:text-slate-600"
              onClick={handleClose}
            >
              ✕
            </button>
          )}
        </div>

        {/* Amount */}
        <p className="mb-4 text-center text-2xl font-bold text-slate-900">
          ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </p>

        {/* QR Image */}
        <div className="flex justify-center mb-4">
          <img
            src={qrImageUrl}
            alt="Razorpay QR code"
            className="h-56 w-56 rounded-lg border border-slate-200 object-contain"
          />
        </div>

        {/* Status */}
        {paid ? (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-emerald-50 py-3 text-emerald-700 font-semibold text-base">
            <span className="text-xl">✓</span>
            <span>Paid</span>
          </div>
        ) : expired ? (
          <div className="mb-4 rounded-lg bg-amber-50 py-2 text-center text-sm text-amber-700 font-medium">
            QR expired — please generate a new one.
          </div>
        ) : (
          <div className="mb-4 flex items-center justify-center gap-2 text-sm text-slate-500">
            {/* Spinner */}
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500"
              aria-hidden="true"
            />
            <span>Waiting for payment…</span>
          </div>
        )}

        {/* Countdown */}
        {!paid && (
          <p
            className={`mb-5 text-center text-xs ${
              expired ? "text-amber-600" : "text-slate-400"
            }`}
          >
            {expired ? "Expired" : `Expires in ${countdownLabel}`}
          </p>
        )}

        {/* Actions */}
        {!paid && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={expired}
              onClick={handleCheckNow}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Check now
            </button>
            <button
              type="button"
              onClick={handleCancelQr}
              className="w-full rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              Cancel QR
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
