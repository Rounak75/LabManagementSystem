"use client";
import { useEffect } from "react";
import { formatINR } from "@/lib/format";
import { COUNTER_PAYMENT_METHODS, type CounterPaymentMethod } from "@lab/types";

/**
 * Records what the patient handed over at the counter, at the moment the visit is
 * created. Without this the money was invisible until someone opened the invoice
 * later — and for staff-portal visits there was no invoice to open at all.
 *
 * Defaults to nothing paid. Recording a payment that never happened loses the lab
 * money and is not caught by anything downstream, so taking money is always an
 * explicit tap; "Paid full" is one tap for the common case.
 */
export function CounterPayment({
  total,
  amountPaid,
  setAmountPaid,
  method,
  setMethod,
}: {
  total: number;
  amountPaid: number;
  setAmountPaid: (n: number) => void;
  method: CounterPaymentMethod;
  setMethod: (m: CounterPaymentMethod) => void;
}) {
  // Deselecting a test lowers the total; a previously-entered amount can end up
  // above it, which the server rejects. Clamp so the form cannot be submitted in
  // a state the server will refuse.
  useEffect(() => {
    if (amountPaid > total) setAmountPaid(total);
  }, [total, amountPaid, setAmountPaid]);

  if (total <= 0) return null;

  const balance = Math.max(0, total - amountPaid);
  const isFull = amountPaid >= total && total > 0;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold uppercase tracking-widest text-slate-600">Paid now</span>
        {amountPaid > 0 && (
          <button
            type="button"
            onClick={() => setAmountPaid(0)}
            className="text-xs font-semibold text-brand transition-colors hover:text-brand-dark"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setAmountPaid(total)}
          className={`rounded-xl border px-4 py-3 text-[14px] font-semibold transition-all duration-300 ease-out-fluid ${
            isFull
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
          }`}
        >
          Paid full · {formatINR(total)}
        </button>
        <button
          type="button"
          onClick={() => setAmountPaid(0)}
          className={`rounded-xl border px-4 py-3 text-[14px] font-semibold transition-all duration-300 ease-out-fluid ${
            amountPaid === 0
              ? "border-slate-400 bg-slate-100 text-slate-800"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
          }`}
        >
          Nothing yet
        </button>
      </div>

      <label className="block">
        <span className="field-label">Or enter part payment</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={total}
          step="1"
          value={amountPaid === 0 ? "" : amountPaid}
          placeholder="0"
          onChange={(e) => {
            const n = Number(e.target.value);
            setAmountPaid(Number.isFinite(n) ? Math.min(Math.max(0, n), total) : 0);
          }}
          className="input"
        />
      </label>

      {amountPaid > 0 && (
        <div className="flex gap-2">
          {COUNTER_PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`flex-1 rounded-xl border px-4 py-2.5 text-[14px] font-semibold transition-all duration-300 ease-out-fluid ${
                method === m
                  ? "border-brand bg-brand/5 text-brand-dark"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-200/60 pt-3">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-600">Balance</span>
        <strong
          className={`font-mono text-lg font-bold tracking-tight ${
            balance > 0 ? "text-amber-600" : "text-emerald-600"
          }`}
        >
          {formatINR(balance)}
        </strong>
      </div>
    </div>
  );
}
