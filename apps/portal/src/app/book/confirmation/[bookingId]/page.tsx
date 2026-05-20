// Phase 3d Plan F — confirmation page shown after a successful submission.
// Static & shareable; links to the status page where the patient can poll.

import Link from "next/link";

export const dynamic = "force-dynamic";

export default function ConfirmationPage({ params }: { params: { bookingId: string } }) {
  return (
    <div className="mt-6 max-w-md mx-auto space-y-4 text-center">
      <div className="mx-auto h-14 w-14 rounded-full bg-green-100 text-green-700 grid place-items-center text-3xl">
        ✓
      </div>
      <h1 className="text-xl font-semibold">Booking received</h1>
      <p className="text-sm text-slate-700">
        Your booking ID is <strong className="font-mono">{params.bookingId}</strong>.
      </p>
      <p className="text-sm text-slate-700">
        Our staff will call you within 4 working hours to confirm the visit.
      </p>
      <p className="text-sm text-slate-600">
        Lab phone:{" "}
        <a className="text-blue-700 underline" href="tel:6202924306">
          6202924306
        </a>
      </p>
      <div className="flex flex-col gap-2 items-stretch pt-2">
        <Link
          href={`/book/status/${params.bookingId}`}
          className="block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
        >
          Check status
        </Link>
        <Link href="/" className="block px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded text-sm">
          Back to home
        </Link>
      </div>
    </div>
  );
}
