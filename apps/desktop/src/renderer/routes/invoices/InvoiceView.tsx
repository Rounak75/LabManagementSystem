import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useState } from "react";
import { useAuth } from "@/stores/auth.store";
import { useToast } from "@/lib/toast.store";
import { formatDistanceToNow } from "date-fns";
import { QrPaymentModal } from "@/components/QrPaymentModal";
import { UpiQrModal } from "@/components/UpiQrModal";

type Inv = {
  id: string;
  subtotal: string;
  discountAmount: string;
  total: string;
  amountPaid: string;
  paymentStatus: "Pending" | "Partial" | "Paid";
  paymentMethod: string | null;
  razorpayPaymentLinkId: string | null;
  paymentLinkStatus: string | null;
  paymentLinkExpiresAt: string | null;
  visit: {
    visitId: string;
    visitDate: string;
    patient: { name: string; patientId: string; phone?: string | null };
    visitTests: { test: { name: string; price: string } }[];
  };
};

type Settings = {
  razorpayMode?: string | null;
  labUpiVpa?: string | null;
  labUpiPayeeName?: string | null;
  labName?: string | null;
};

type QrModal = { open: boolean; imageUrl?: string; expiresAt?: Date | string };

export default function InvoiceView() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  const toast = useToast();

  const { data: inv } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => call<Inv>("invoices:get", { id }),
    enabled: !!id,
  });

  const { data: settings } = useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: () => call("settings:get", {}),
  });

  const [discount, setDiscount] = useState("");
  const [isPercent, setIsPercent] = useState(false);
  const [cashAmt, setCashAmt] = useState("");
  const [qrModal, setQrModal] = useState<QrModal>({ open: false });
  const [upiModalOpen, setUpiModalOpen] = useState(false);

  const razorpayActive =
    !!settings?.razorpayMode && settings.razorpayMode !== "Off";
  const patientPhone = inv?.visit?.patient?.phone;

  const applyDiscount = useMutation({
    mutationFn: () =>
      call("invoices:applyDiscount", {
        invoiceId: id,
        amount: Number(discount),
        isPercent,
      }),
    onSuccess: () => {
      setDiscount("");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
    },
  });

  const recordCash = useMutation({
    mutationFn: () =>
      call("invoices:recordCash", { invoiceId: id, amount: Number(cashAmt) }),
    onSuccess: () => {
      setCashAmt("");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
    },
  });

  const sendLink = useMutation({
    mutationFn: () => call("payments:createLink", { invoiceId: id }),
    onSuccess: () => {
      toast.success("Link sent — SMS queued");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
    },
    onError: (e: Error) => toast.error(String(e.message)),
  });

  const showQr = useMutation({
    mutationFn: () =>
      call<{ id: string; imageUrl: string; expiresAt: Date | string }>(
        "payments:createQr",
        { invoiceId: id }
      ),
    onSuccess: (res) => setQrModal({ open: true, imageUrl: res.imageUrl, expiresAt: res.expiresAt }),
    onError: (e: Error) => toast.error(String(e.message)),
  });

  const recordUpi = useMutation({
    mutationFn: () => call("invoices:recordUpi", { invoiceId: id }),
    onSuccess: () => {
      setUpiModalOpen(false);
      toast.success("Payment recorded.");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
    },
    onError: (e: Error) => toast.error(String(e.message)),
  });

  if (!inv) return <div className="text-slate-500">Loading…</div>;

  const due = Number(inv.total) - Number(inv.amountPaid);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold">Invoice</h1>
      <div className="mb-4 text-sm text-slate-500">
        {inv.visit.patient.name} · {inv.visit.patient.patientId} · {inv.visit.visitId}
      </div>

      <Card className="mb-4 p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-4 py-3">Test</th>
              <th className="px-4 py-3 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {inv.visit.visitTests.map((vt, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-3">{vt.test.name}</td>
                <td className="px-4 py-3 text-right">₹{Number(vt.test.price).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td className="px-4 py-2 text-right font-medium">Subtotal</td>
              <td className="px-4 py-2 text-right">₹{Number(inv.subtotal).toFixed(0)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-right font-medium">Discount</td>
              <td className="px-4 py-2 text-right">- ₹{Number(inv.discountAmount).toFixed(0)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-right font-bold">Total</td>
              <td className="px-4 py-2 text-right font-bold">₹{Number(inv.total).toFixed(0)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-right">Paid</td>
              <td className="px-4 py-2 text-right">₹{Number(inv.amountPaid).toFixed(0)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-right">Due</td>
              <td className="px-4 py-2 text-right text-danger font-semibold">₹{due.toFixed(0)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* Razorpay paid status */}
      {inv.paymentStatus === "Paid" && inv.paymentMethod === "Online" && (
        <p className="mb-3 text-sm text-green-700">Paid via Razorpay</p>
      )}
      {inv.paymentStatus === "Paid" && inv.paymentMethod === "UPI" && (
        <p className="mb-3 text-sm text-green-700">Paid via UPI</p>
      )}

      {user?.role === "Admin" && (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold">Apply discount (Admin)</h2>
          <div className="flex items-end gap-2">
            <Input
              label={isPercent ? "Discount %" : "Discount ₹"}
              type="number"
              value={discount}
              onChange={e => setDiscount(e.target.value)}
            />
            <label className="flex items-center gap-1 pb-2 text-sm">
              <input
                type="checkbox"
                checked={isPercent}
                onChange={e => setIsPercent(e.target.checked)}
              />
              %
            </label>
            <Button onClick={() => applyDiscount.mutate()} disabled={!discount}>
              Apply
            </Button>
          </div>
        </Card>
      )}

      {inv.paymentStatus !== "Paid" && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Record cash payment</h2>
          <div className="flex items-end gap-2">
            <Input
              label="Amount ₹"
              type="number"
              value={cashAmt}
              onChange={e => setCashAmt(e.target.value)}
            />
            <Button onClick={() => recordCash.mutate()} disabled={!cashAmt}>
              Record
            </Button>
          </div>

          {/*
            Razorpay buttons — hidden until KYC clears. Uncomment this block (and the
            matching `Resend pay link` / `Show QR` Cards) to re-enable Razorpay.

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              disabled={!razorpayActive || !patientPhone || sendLink.isPending}
              onClick={() => sendLink.mutate()}
            >
              {inv.razorpayPaymentLinkId ? "Resend pay link" : "Send pay link"}
            </Button>

            <Button
              disabled={!razorpayActive || showQr.isPending}
              onClick={() => showQr.mutate()}
            >
              Show QR
            </Button>
          </div>
          */}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {settings?.labUpiVpa ? (
              <Button onClick={() => setUpiModalOpen(true)}>Show UPI QR</Button>
            ) : (
              <p className="text-sm text-slate-500">
                Set lab UPI in Settings → Payments to enable UPI QR payments.
              </p>
            )}
          </div>

          {/* Payment link status */}
          {inv.razorpayPaymentLinkId && inv.paymentLinkStatus === "Created" && inv.paymentLinkExpiresAt && (
            <p className="mt-2 text-sm text-gray-500">
              Link active, expires{" "}
              {formatDistanceToNow(new Date(inv.paymentLinkExpiresAt), { addSuffix: true })}
            </p>
          )}
        </Card>
      )}

      {qrModal.open && qrModal.imageUrl && qrModal.expiresAt && (
        <QrPaymentModal
          invoiceId={inv.id}
          qrImageUrl={qrModal.imageUrl}
          amount={Number(inv.total)}
          expiresAt={new Date(qrModal.expiresAt)}
          onClose={() => {
            setQrModal({ open: false });
            qc.invalidateQueries({ queryKey: ["invoice", id] });
          }}
        />
      )}

      {upiModalOpen && settings?.labUpiVpa && (
        <UpiQrModal
          invoiceId={inv.id}
          amount={Number(inv.total)}
          vpa={settings.labUpiVpa}
          payeeName={settings.labUpiPayeeName || settings.labName || "Lab"}
          onMarkReceived={() => recordUpi.mutate()}
          onClose={() => setUpiModalOpen(false)}
          marking={recordUpi.isPending}
        />
      )}
    </div>
  );
}
