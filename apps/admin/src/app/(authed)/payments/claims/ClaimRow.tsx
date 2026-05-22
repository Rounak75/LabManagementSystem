"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/format";
import { embedOne } from "@/lib/embed";

export function ClaimRow({ claim }: { claim: Record<string, unknown> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const invoice = embedOne(claim.invoices as never) as { total?: number; visits?: unknown } | null;
  const visit = embedOne(invoice?.visits as never) as { visit_id?: string; patients?: unknown } | null;
  const patient = embedOne(visit?.patients as never) as { name?: string } | null;

  const resolve = (status: "Confirmed" | "Dismissed") => {
    setError(null);
    startTransition(async () => {
      const r = await fetch(`/api/payments/claims/${claim.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        setError("Could not update claim. Try again.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3">
      <div>
        <div className="font-medium">{patient?.name ?? "—"}</div>
        <div className="text-xs text-gray-500">
          {visit?.visit_id ?? "—"}
          {invoice?.total != null ? ` · Invoice ${formatINR(Number(invoice.total))}` : ""}
        </div>
        {error && <div className="mt-1 text-xs font-medium text-rose-600">{error}</div>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => resolve("Dismissed")}
          disabled={pending}
          className="btn-ghost px-3 py-1.5"
        >
          Dismiss
        </button>
        <button
          onClick={() => resolve("Confirmed")}
          disabled={pending}
          className="btn-success px-3 py-1.5"
        >
          Mark handled
        </button>
      </div>
    </li>
  );
}
