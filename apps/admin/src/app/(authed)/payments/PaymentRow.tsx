"use client";
import { useState } from "react";
import { formatINR, formatPhone } from "@/lib/format";
import { embedOne } from "@/lib/embed";
import { MarkPaidDialog } from "./MarkPaidDialog";

interface InvoiceRow {
  id: string;
  total: number;
  amount_paid: number;
  visit_id: string;
  visits: Parameters<typeof embedOne>[0] & unknown;
}

export function PaymentRow({ invoice }: { invoice: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const inv = invoice as unknown as InvoiceRow;
  const visit = embedOne(inv.visits as never) as { visit_id?: string; patients?: unknown } | null;
  const patient = embedOne(visit?.patients as never) as { name?: string; phone?: string } | null;
  const outstanding = Number(inv.total) - Number(inv.amount_paid);
  const partial = Number(inv.amount_paid) > 0;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-900">
          {patient?.name ?? <span className="italic text-slate-400">Unknown patient</span>}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {visit?.visit_id ?? "—"}
          {patient?.phone ? ` · ${formatPhone(patient.phone)}` : ""}
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-rose-600">{formatINR(outstanding)}</span>
          <span className="text-xs text-slate-400">
            {partial ? `outstanding of ${formatINR(Number(inv.total))}` : "due"}
          </span>
        </div>
      </div>
      <button onClick={() => setOpen(true)} className="btn-success whitespace-nowrap">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Mark UPI received
      </button>
      {open && (
        <MarkPaidDialog
          invoiceId={inv.id}
          total={Number(inv.total)}
          amountPaid={Number(inv.amount_paid)}
          onClose={() => setOpen(false)}
        />
      )}
    </li>
  );
}
