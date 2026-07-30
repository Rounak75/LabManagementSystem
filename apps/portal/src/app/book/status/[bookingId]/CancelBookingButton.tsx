"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { btnSecondary } from "@portal/components/ui";
import { Close } from "@portal/components/icons";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (!confirm("Cancel this booking?")) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Could not cancel. Please refresh and try again.");
        return;
      }
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <button
        onClick={handleCancel}
        disabled={working}
        className={`${btnSecondary} w-full hover:border-alert/40 hover:text-alert`}
      >
        <Close size={15} />
        {working ? "Cancelling…" : "Cancel this booking"}
      </button>
      {error && (
        <div className="rounded-2xl bg-alert-soft px-4 py-3.5 text-[13px] leading-relaxed text-text">
          {error}
        </div>
      )}
    </div>
  );
}
