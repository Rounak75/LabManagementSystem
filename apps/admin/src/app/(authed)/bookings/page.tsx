import { getSessionUser } from "@/lib/auth-session";
import { listBookings, listPhlebotomists, type BookingStatus } from "@/lib/data-bookings";
import { BookingRow } from "./BookingRow";
import Link from "next/link";

const TABS: BookingStatus[] = ["Pending", "Approved", "Declined", "Completed"];

export default async function BookingsPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = (await getSessionUser())!;
  const status = (TABS.includes(searchParams.status as BookingStatus)
    ? (searchParams.status as BookingStatus)
    : "Pending");
  const bookings = await listBookings(user.token, status);
  const phleb = await listPhlebotomists(user.token);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Home-visit bookings</h1>
      <div className="flex gap-2 mb-4 text-sm">
        {TABS.map((s) => (
          <Link
            key={s}
            href={`/bookings?status=${s}`}
            className={`px-3 py-1 rounded border ${status === s ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
          >
            {s}
          </Link>
        ))}
      </div>
      {bookings.length === 0 ? (
        <p className="text-sm text-gray-500">No bookings in this state.</p>
      ) : (
        <ul className="bg-white rounded border divide-y">
          {bookings.map((b) => (
            <BookingRow key={b.id as string} booking={b} phlebotomists={phleb} />
          ))}
        </ul>
      )}
    </div>
  );
}
