// Phase 3d Plan F — public booking status page. Anyone who knows the booking
// ID can view; rows older than 7 days are hidden per spec §7.7.

import { notFound } from "next/navigation";
import { getServiceClient } from "@portal/lib/supabase-server";
import { CancelBookingButton } from "./CancelBookingButton";
import {
  Band,
  BandBar,
  Card,
  Container,
  Fact,
  Note,
  Tag,
} from "@portal/components/ui";
import { Calendar, Clock, Phone, User } from "@portal/components/icons";
import { labDate } from "@portal/lib/format";

export const dynamic = "force-dynamic";

type Tone = "ok" | "notice" | "alert" | "neutral" | "brand";

const STATUS_TONE: Record<string, Tone> = {
  Pending: "notice",
  Approved: "ok",
  Declined: "alert",
  Cancelled: "neutral",
  Completed: "brand",
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

export default async function StatusPage({ params: paramsPromise }: { params: Promise<{ bookingId: string }> }) {
  const params = await paramsPromise;
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
      <>
        <Band waves className="pb-16">
          <Container>
            <BandBar back={{ href: "/", label: "Back to home" }} title="Booking status" />
          </Container>
        </Band>
        <Container>
          <div className="mx-auto -mt-8 max-w-md">
            <Card className="p-6 text-center">
              <p className="text-[14px] leading-relaxed text-soft">
                This booking is no longer publicly viewable.
              </p>
              <a
                href="tel:6202924306"
                className="tap mt-5 inline-flex items-center gap-2 rounded-2xl bg-brand px-5 py-3 font-mono num text-[14px] font-semibold text-brand-fg hover:bg-brand-hover"
              >
                <Phone size={15} />
                6202924306
              </a>
            </Card>
          </div>
        </Container>
      </>
    );
  }

  // Stored as UTC midnight of the day the patient chose, so it is formatted
  // in UTC too — otherwise the server's own zone can shift it a day.
  const date = labDate(row!.preferred_date, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const tone = STATUS_TONE[row!.status] ?? "notice";
  const noteTone = tone === "neutral" ? "brand" : tone;

  return (
    <>
      <Band waves className="pb-16">
        <Container>
          <BandBar back={{ href: "/", label: "Back to home" }} title="Booking status" />
          <p className="pb-2 text-center font-mono num text-[13px] text-band/60">
            {row!.booking_id}
          </p>
        </Container>
      </Band>

      <Container>
        <div className="mx-auto -mt-8 max-w-md space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4">
              <p className="font-heading text-[17px] font-bold tracking-snug text-text">
                {row!.status}
              </p>
              <Tag tone={tone}>{row!.preferred_slot}</Tag>
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-soft">
              {statusMessage(row!.status, row!.decline_reason)}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-muted">
                  <User size={16} />
                </span>
                <Fact label="Patient" value={row!.patient_name} />
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-muted">
                  <Calendar size={16} />
                </span>
                <Fact
                  label="Preferred date"
                  value={<span className="font-mono num">{date}</span>}
                />
              </div>
            </div>
          </Card>

          {row!.status === "Pending" && (
            <>
              <Note tone={noteTone} icon={<Clock size={17} />}>
                Staff review bookings during opening hours. You can cancel any
                time before we confirm.
              </Note>
              <CancelBookingButton bookingId={row!.booking_id} />
            </>
          )}
        </div>
      </Container>
    </>
  );
}
