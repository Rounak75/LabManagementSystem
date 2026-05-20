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

  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3">
      <div>
        <div className="font-medium">{patient?.name ?? "—"}</div>
        <div className="text-xs text-gray-500">
          {visit?.visit_id ?? "—"} · {patient?.phone ? formatPhone(patient.phone) : "—"}
        </div>
        <div className="text-sm mt-1">
          Outstanding: <strong>{formatINR(outstanding)}</strong> of {formatINR(Number(inv.total))}
        </div>
      </div>
      <button
        onClick={() => setOpen(true)}
        className="bg-green-600 text-white rounded px-3 py-2 text-sm font-medium whitespace-nowrap"
      >
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
