"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/format";

/**
 * What this visit owes, and the Admin's release valve for the report gate.
 *
 * The visit page showed no money at all, so the one screen that has the patient
 * in front of it could not say whether they had paid. The portal now withholds a
 * verified report while a balance remains, which makes that invisible balance the
 * thing standing between the patient and their result — so the answer, and the
 * override, belong here.
 */
export function BillingPanel({
  visitId,
  invoice,
  overridden,
  allVerified,
  isAdmin,
}: {
  visitId: string;
  invoice: { id: string; total: number; amount_paid: number; payment_status: string } | null;
  overridden: boolean;
  allVerified: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!invoice) {
    return (
      <div className="card mb-5 px-4 py-3 text-sm text-slate-500">
        No bill was raised for this visit.
      </div>
    );
  }

  const total = Number(invoice.total ?? 0);
  const paid = Number(invoice.amount_paid ?? 0);
  const balance = Math.max(0, total - paid);
  const blocked = balance > 0 && !overridden;

  async function setOverride(release: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await fetch(`/api/visits/${visitId}/release-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ release }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <div className="card mb-5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-slate-500">Billed</span>{" "}
          <strong className="font-mono">{formatINR(total)}</strong>
          <span className="mx-2 text-slate-300">·</span>
          <span className="text-slate-500">Paid</span>{" "}
          <strong className="font-mono">{formatINR(paid)}</strong>
        </div>
        <div className="text-sm">
          <span className="text-slate-500">Balance</span>{" "}
          <strong className={`font-mono ${balance > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {formatINR(balance)}
          </strong>
        </div>
      </div>

      {balance > 0 && allVerified && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {overridden ? (
            <>The patient can download this report even though {formatINR(balance)} is unpaid.</>
          ) : (
            <>The patient cannot download this report until {formatINR(balance)} is paid.</>
          )}
        </div>
      )}

      {/* Printing is never blocked — the owner is standing in the lab and knows
          the patient. This only governs the patient's own portal download. */}
      {isAdmin && balance > 0 && (
        <div className="mt-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => setOverride(!overridden)}
            className={overridden ? "btn-ghost" : "btn-primary"}
          >
            {pending ? "Saving…" : overridden ? "Withhold report again" : "Release report anyway"}
          </button>
        </div>
      )}

      {blocked && !isAdmin && (
        <p className="mt-2 text-xs text-slate-500">Only an Admin can release an unpaid report.</p>
      )}
      {error ? (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
      ) : null}
    </div>
  );
}
