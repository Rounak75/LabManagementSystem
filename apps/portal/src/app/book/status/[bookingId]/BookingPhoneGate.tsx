"use client";

// Asks for the phone number on the booking before the status page will show it.
//
// Written to read as a normal step rather than as a security control, because to
// the patient it is one: they know their own number, they type it once, and the
// page remembers for an hour. Nobody should have to understand why it is here.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, btnPrimary } from "@portal/components/ui";
import { Phone } from "@portal/components/icons";

export function BookingPhoneGate({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/verify-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Could not check that number. Please try again.");
        return;
      }
      // The cookie is set; re-rendering the page server-side now passes the gate.
      router.refresh();
    } catch {
      setError("Could not reach the lab. Please check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col items-center text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <Phone size={20} />
        </span>
        <h2 className="font-heading text-[17px] font-bold tracking-snug text-text">
          Confirm it&rsquo;s you
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-soft">
          Enter the mobile number you booked with, so we only show your visit
          details to you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-2.5">
        <label htmlFor="booking-phone" className="sr-only">
          Mobile number used for this booking
        </label>
        <input
          id="booking-phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="10-digit mobile number"
          className="w-full rounded-2xl border border-line bg-surface px-4 py-3 font-mono num text-[15px] text-text placeholder:font-sans placeholder:text-muted focus:border-brand focus:outline-none"
        />
        <button type="submit" disabled={working} className={`${btnPrimary} w-full`}>
          {working ? "Checking…" : "Show my booking"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-2xl bg-alert-soft px-4 py-3.5 text-[13px] leading-relaxed text-text"
        >
          {error}
        </div>
      )}
    </Card>
  );
}
