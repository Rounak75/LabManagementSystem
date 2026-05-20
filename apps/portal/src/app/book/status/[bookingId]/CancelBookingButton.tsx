"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="space-y-2">
      <button
        onClick={handleCancel}
        disabled={working}
        className="w-full bg-slate-200 hover:bg-slate-300 py-2 rounded text-sm disabled:opacity-50"
      >
        {working ? "Cancelling…" : "Cancel this booking"}
      </button>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-2 rounded">{error}</div>
      )}
    </div>
  );
}
