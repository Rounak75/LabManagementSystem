// Phase 3d Plan F — confirmation page shown after a successful submission.
// Static & shareable; links to the status page where the patient can poll.

import Link from "next/link";
import { Band, Card, Container, Note, btnPrimary, btnSecondary } from "@portal/components/ui";
import { ArrowRight, Check, Clock, Phone } from "@portal/components/icons";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({ params: paramsPromise }: { params: Promise<{ bookingId: string }> }) {
  const params = await paramsPromise;
  return (
    <>
      <Band waves className="pb-28">
        <Container className="pt-10">
          <div className="mx-auto max-w-md text-center">
            <span className="rise mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-band ring-1 ring-inset ring-white/25">
              <Check size={30} />
            </span>
            <h1
              className="rise mt-6 font-heading text-[30px] font-extrabold leading-[1.08] tracking-tighter text-band"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              Booking received
            </h1>
            <p
              className="rise mt-3 text-[14px] leading-relaxed text-band/70"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              Our staff will call you within 4 working hours to confirm the visit.
            </p>
          </div>
        </Container>
      </Band>

      <Container>
        <div className="mx-auto -mt-10 max-w-md space-y-4">
          <Card className="p-6 text-center">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">
              Your booking ID
            </p>
            <p className="mt-2 font-mono num text-[26px] font-medium tracking-[0.08em] text-text">
              {params.bookingId}
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              Keep this handy — it’s how you check the status of your visit.
            </p>
          </Card>

          <Note icon={<Clock size={17} />}>
            Nothing is confirmed until we call. If your slot doesn’t work for the
            phlebotomist, staff will offer you the nearest one that does.
          </Note>

          <div className="space-y-2.5">
            <Link
              href={`/book/status/${params.bookingId}`}
              className={`${btnPrimary} w-full`}
            >
              Check status
              <ArrowRight size={16} />
            </Link>
            <a href="tel:6202924306" className={`${btnSecondary} w-full`}>
              <Phone size={16} />
              Call the lab
            </a>
            <Link href="/" className={`${btnSecondary} w-full`}>
              Back to home
            </Link>
          </div>
        </div>
      </Container>
    </>
  );
}
