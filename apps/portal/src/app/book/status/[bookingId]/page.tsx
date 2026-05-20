// Phase 3d Plan F — public booking status page. Anyone who knows the booking
// ID can view; rows older than 7 days are hidden per spec §7.7.

import { notFound } from "next/navigation";
import { getServiceClient } from "@portal/lib/supabase-server";
import { CancelBookingButton } from "./CancelBookingButton";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  Pending: "bg-yellow-50 border-yellow-200 text-yellow-900",
  Approved: "bg-green-50 border-green-200 text-green-900",
  Declined: "bg-red-50 border-red-200 text-red-900",
  Cancelled: "bg-slate-50 border-slate-200 text-slate-800",
  Completed: "bg-blue-50 border-blue-200 text-blue-900",
};

function statusMessage(status: string, declineReason: string | null): string {
  switch (status) {
    case "Pending":
      return "Awaiting staff confirmation. We'll call you within 4 working hours.";
    case "Approved":
      return "Confirmed! Our phlebotomist will visit you on the scheduled date.";
    case "Declined":
      return declineReason
        ? `Unfortunately we couldn't take this booking. Reason: ${declineReason}.`
        : "Unfortunately this booking was declined.";
    case "Cancelled":
      return "You cancelled this booking.";
    case "Completed":
      return "Sample was collected. Your report will be ready soon.";
    default:
      return "";
  }
}

export default async function StatusPage({ params }: { params: { bookingId: string } }) {
  const sb = getServiceClient();
  const { data: row } = await sb
    .from("bookings")
    .select("booking_id, patient_name, preferred_date, preferred_slot, status, decline_reason, created_at, approved_at")
    .eq("booking_id", params.bookingId)
    .maybeSingle();
  if (!row) notFound();

  const ageMs = Date.now() - new Date(row!.created_at).getTime();
  if (ageMs > 7 * 86400_000) {
    return (
      <div className="mt-6 max-w-md mx-auto bg-slate-50 border border-slate-200 p-6 rounded text-center text-sm text-slate-700">
        This booking is no longer publicly viewable. Please call the lab at{" "}
        <a className="text-blue-700 underline" href="tel:6202924306">6202924306</a>.
      </div>
    );
  }

  const date = new Date(row!.preferred_date).toLocaleDateString();
  const style = STATUS_STYLES[row!.status] ?? STATUS_STYLES.Pending;

  return (
    <div className="mt-6 max-w-md mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Booking {row!.booking_id}</h1>
        <p className="text-sm text-slate-600 mt-1">
          {row!.patient_name} · {date} {row!.preferred_slot}
        </p>
      </div>

      <div className={`p-4 rounded border ${style}`}>
        <div className="font-semibold">{row!.status}</div>
        <p className="text-sm mt-1">{statusMessage(row!.status, row!.decline_reason)}</p>
      </div>

      {row!.status === "Pending" && <CancelBookingButton bookingId={row!.booking_id} />}
    </div>
  );
}
