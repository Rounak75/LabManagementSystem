import { getSessionUser } from "@/lib/auth-session";
import { listBookings, listPhlebotomists, type BookingStatus } from "@/lib/data-bookings";
import { BookingRow } from "./BookingRow";
import { PageHeader } from "@/components/PageHeader";
import { FilterTabs } from "@/components/FilterTabs";

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
      <PageHeader title="Home-visit bookings" subtitle="Requests patients sent from the portal" />

      <FilterTabs
        basePath="/bookings"
        param="status"
        current={status}
        options={TABS.map((s) => ({ label: s, value: s }))}
      />

      {bookings.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          No {status.toLowerCase()} bookings.
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {bookings.map((b) => (
            <BookingRow key={b.id as string} booking={b} phlebotomists={phleb} />
          ))}
        </ul>
      )}
    </div>
  );
}
