// Phase 3d Plan F — Admin "Bookings" inbox.
// Lists portal-submitted home-visit bookings; staff can approve/decline.
// Refreshed automatically every 30s so a freshly-pulled booking surfaces
// without the user having to click.

import { useEffect, useMemo, useState } from "react";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, EmptyIcons } from "@/components/ui/EmptyState";
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

  const pendingCount = bookings.filter((b) => b.status === "Pending").length;

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle={`Home-visit requests from the patient portal.${statusFilter === "Pending" && pendingCount > 0 ? ` ${pendingCount} pending.` : ""}`}
        actions={
          <Select
            className="w-44"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_OPTIONS)[number])}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        }
      />

      <Card noPadding>
        {loading && bookings.length === 0 ? (
          <div className="p-6 text-slate-500">Loading…</div>
        ) : bookings.length === 0 ? (
          <EmptyState
            icon={EmptyIcons.home}
            title="No bookings in this state"
            description="Home-visit requests from the patient portal will appear here."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Booked</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Patient</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Phone</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Address</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">When</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 align-top transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-500">
                    <div>{new Date(b.createdAt).toLocaleString("en-IN")}</div>
                    <div className="font-mono">{b.bookingId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{b.patientName}</div>
                    {b.patientEmail ? (
                      <div className="text-xs text-slate-500">{b.patientEmail}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`tel:${b.patientPhone}`} className="text-brand hover:underline">
                      {b.patientPhone}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {b.address}{b.pincode ? <span className="text-slate-500"> · {b.pincode}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {new Date(b.preferredDate).toLocaleDateString("en-IN")}
                    <div className="text-xs text-slate-500">{b.preferredSlot}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.status === "Pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => setApproving(b)}>Approve</Button>
                        <Button variant="danger" onClick={() => setDeclining(b)}>Decline</Button>
                      </div>
                    ) : (
                      <>
                        <StatusBadge variant={b.status === "Approved" ? "success" : b.status === "Declined" ? "error" : "neutral"}>
                          {b.status}
                        </StatusBadge>
                        {b.declineReason ? <span className="text-xs font-medium text-slate-600"> · {b.declineReason}</span> : null}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {approving ? (
        <ApproveBookingModal
          booking={approving}
          onClose={(refresh) => {
            setApproving(null);
            if (refresh) reload();
          }}
        />
      ) : null}
      {declining ? (
        <DeclineBookingModal
          booking={declining}
          onClose={(refresh) => {
            setDeclining(null);
            if (refresh) reload();
          }}
        />
      ) : null}
    </div>
  );
}
