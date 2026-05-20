// Phase 3d Plan F — Admin "Bookings" inbox.
// Lists portal-submitted home-visit bookings; staff can approve/decline.
// Refreshed automatically every 30s so a freshly-pulled booking surfaces
// without the user having to click.

import { useEffect, useMemo, useState } from "react";
import { call } from "@/lib/api";
import { ApproveBookingModal } from "./ApproveBookingModal";
import { DeclineBookingModal } from "./DeclineBookingModal";

interface BookingRow {
  id: string;
  bookingId: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string | null;
  address: string;
  pincode: string | null;
  testIds: string;
  preferredDate: string;
  preferredSlot: string;
  notes: string | null;
  status: string;
  declineReason: string | null;
  createdAt: string;
  version: number;
}

const STATUS_OPTIONS = ["Pending", "Approved", "Declined", "Cancelled", "Completed", "All"] as const;

export default function BookingsPage() {
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("Pending");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<BookingRow | null>(null);
  const [declining, setDeclining] = useState<BookingRow | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const rows = await call<BookingRow[]>("bookings:list", { status: statusFilter });
      setBookings(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === "Pending").length,
    [bookings],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Bookings</h1>
          <p className="text-sm text-slate-500">
            Home-visit requests from the patient portal.
            {statusFilter === "Pending" && pendingCount > 0 && ` ${pendingCount} pending.`}
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_OPTIONS)[number])}
          className="rounded border-slate-300 text-sm"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading && bookings.length === 0 ? (
        <div className="bg-white border rounded p-8 text-center text-slate-400 text-sm">Loading…</div>
      ) : bookings.length === 0 ? (
        <div className="bg-white border rounded p-8 text-center text-slate-500 text-sm">
          No bookings in this state.
        </div>
      ) : (
        <div className="overflow-hidden bg-white border rounded">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left p-2">Booked</th>
                <th className="text-left p-2">Patient</th>
                <th className="text-left p-2">Phone</th>
                <th className="text-left p-2">Address</th>
                <th className="text-left p-2">When</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t align-top">
                  <td className="p-2 text-xs text-slate-500">
                    <div>{new Date(b.createdAt).toLocaleString()}</div>
                    <div className="font-mono">{b.bookingId}</div>
                  </td>
                  <td className="p-2">
                    <div>{b.patientName}</div>
                    {b.patientEmail && (
                      <div className="text-xs text-slate-500">{b.patientEmail}</div>
                    )}
                  </td>
                  <td className="p-2">
                    <a href={`tel:${b.patientPhone}`} className="text-blue-700 underline">
                      {b.patientPhone}
                    </a>
                  </td>
                  <td className="p-2 text-slate-700">
                    {b.address}{b.pincode && <span className="text-slate-500"> · {b.pincode}</span>}
                  </td>
                  <td className="p-2">
                    {new Date(b.preferredDate).toLocaleDateString()}
                    <div className="text-xs text-slate-500">{b.preferredSlot}</div>
                  </td>
                  <td className="p-2">
                    {b.status === "Pending" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setApproving(b)}
                          className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setDeclining(b)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {b.status}
                        {b.declineReason && <span> · {b.declineReason}</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {approving && (
        <ApproveBookingModal
          booking={approving}
          onClose={(refresh) => {
            setApproving(null);
            if (refresh) reload();
          }}
        />
      )}
      {declining && (
        <DeclineBookingModal
          booking={declining}
          onClose={(refresh) => {
            setDeclining(null);
            if (refresh) reload();
          }}
        />
      )}
    </div>
  );
}
