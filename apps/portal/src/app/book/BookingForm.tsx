"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isOpenNow,
  slotsAvailableOn,
  restrictionForSlots,
  slotLabel,
  restrictionLabel,
  type LabConfig,
  type ClosureRow,
  type Slot,
  type CollectionTimeRestriction,
} from "@portal/lib/lab-status";

interface Test {
  id: string;
  name: string;
  price: number;
  category: string;
  collectionTimeRestriction: CollectionTimeRestriction;
}

const ALL_SLOTS: readonly Slot[] = ["Morning", "Afternoon", "Evening"];

export function BookingForm({
  tests,
  blackoutDates,
  cfg,
  closures,
}: {
  tests: Test[];
  blackoutDates: string[];
  cfg: LabConfig | null;
  closures: ClosureRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<Slot>("Morning");
  const [notes, setNotes] = useState("");
  const [testIds, setTestIds] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  async function refreshCaptcha() {
    try {
      const res = await fetch("/api/captcha", { cache: "no-store" });
      const data = await res.json();
      setCaptchaQuestion(data.question ?? "");
      setCaptchaToken(data.token ?? "");
      setCaptchaAnswer("");
    } catch {
      setCaptchaQuestion("");
      setCaptchaToken("");
    }
  }

  useEffect(() => {
    refreshCaptcha();
  }, []);

  const visible = useMemo(() => {
    if (!filter.trim()) return tests.slice(0, 30);
    const q = filter.toLowerCase();
    return tests.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 30);
  }, [tests, filter]);

  const total = tests.filter((t) => testIds.includes(t.id)).reduce((s, t) => s + t.price, 0);

  function toggle(id: string) {
    setTestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function isBlackedOut(d: string) {
    return blackoutDates.includes(d);
  }

  const labStatus = cfg ? isOpenNow(cfg, closures) : { open: true, reason: null };

  const selectedTests = tests.filter((t) => testIds.includes(t.id));
  const requiredSlots = restrictionForSlots(selectedTests);
  const restrictedTest = selectedTests.find((t) => t.collectionTimeRestriction);

  const availableSlots = useMemo<readonly Slot[]>(() => {
    if (!cfg || !date) return ALL_SLOTS;
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return ALL_SLOTS;
    let slots: readonly Slot[] = slotsAvailableOn(cfg, closures, parsed);
    if (requiredSlots) slots = slots.filter((s) => requiredSlots.includes(s));
    return slots;
  }, [cfg, closures, date, requiredSlots]);

  useEffect(() => {
    if (availableSlots.length === 0) return;
    if (!availableSlots.includes(slot)) {
      setSlot(availableSlots[0]!);
    }
  }, [availableSlots, slot]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (testIds.length === 0) {
      setError("Please choose at least one test.");
      return;
    }
    if (!date) {
      setError("Please pick a preferred date.");
      return;
    }
    if (isBlackedOut(date)) {
      setError("The lab is closed on that date — please pick another.");
      return;
    }
    if (availableSlots.length === 0) {
      setError("No slots are available on that date. Please pick another date.");
      return;
    }

    const answerNum = parseInt(captchaAnswer, 10);
    if (!Number.isFinite(answerNum)) {
      setError("Please answer the question at the bottom.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: name,
          patientPhone: phone,
          patientEmail: email || null,
          address,
          pincode: pincode || null,
          testIds,
          preferredDate: date,
          preferredSlot: slot,
          notes: notes || null,
          captchaToken,
          captchaAnswer: answerNum,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "captcha_failed") {
          setError("That answer wasn't right. Please try the new question.");
          await refreshCaptcha();
        } else {
          setError(data.message ?? data.error ?? "Could not submit booking.");
        }
        return;
      }
      setBookingId(data.bookingId);
      router.push(`/book/confirmation/${data.bookingId}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (bookingId)
    return (
      <div className="mt-6 rounded-lg border border-ok/30 bg-ok/5 p-4">
        <h2 className="text-[15px] text-text font-medium">
          Booking received — <span className="font-mono num">{bookingId}</span>
        </h2>
        <p className="text-[13px] text-soft mt-2">Loading your confirmation…</p>
      </div>
    );

  const submitDisabled = submitting || !captchaToken || availableSlots.length === 0;

  const inputCls =
    "block w-full rounded-lg bg-bg border border-line text-text px-3 py-2 text-[14px] placeholder:text-muted focus:outline-none focus:border-brand";

  return (
    <div className="mt-6 space-y-5">
      {cfg && !labStatus.open && (
        <div className="rounded-lg border border-notice/30 bg-notice-soft px-4 py-3 text-[13px] text-text">
          <strong className="text-text">The lab is currently closed.</strong>
          {labStatus.reason ? <> {labStatus.reason}.</> : null} You can still submit a
          booking — staff will call to confirm during open hours.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-line bg-elev p-5 space-y-4"
      >
        <Section title="Patient">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" className="col-span-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputCls}
                placeholder="As it should appear on the report"
              />
            </Field>
            <Field label="Phone · 10 digits">
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                required
                className={`${inputCls} font-mono num`}
                placeholder="9876543210"
              />
            </Field>
            <Field label="Email · optional">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Collection address" className="col-span-2">
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                rows={2}
                className={inputCls}
                placeholder="Door no., street, locality, landmark"
              />
            </Field>
            <Field label="PIN code · optional">
              <input
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                maxLength={6}
                className={`${inputCls} font-mono num`}
                placeholder="831003"
              />
            </Field>
          </div>
        </Section>

        <Section title="Tests">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search the catalogue…"
            className={inputCls}
          />
          <div className="mt-2 rounded-lg border border-line bg-bg max-h-64 overflow-y-auto divide-y divide-line">
            {visible.map((t) => {
              const checked = testIds.includes(t.id);
              return (
                <label
                  key={t.id}
                  className={`flex items-center gap-3 px-3 py-2 text-[13px] cursor-pointer ${
                    checked ? "bg-brand-soft" : "hover:bg-elev"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(t.id)}
                    className="accent-brand"
                  />
                  <span className="flex-1 text-text">
                    {t.name}
                    {t.collectionTimeRestriction && (
                      <span className="ml-2 text-[11px] text-notice">
                        · {restrictionLabel(t.collectionTimeRestriction)}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-soft num">
                    ₹{t.price.toFixed(0)}
                  </span>
                </label>
              );
            })}
            {visible.length === 0 && (
              <p className="px-3 py-3 text-[12px] text-muted">No matching tests.</p>
            )}
          </div>
          {testIds.length > 0 && (
            <p className="text-[13px] text-soft mt-2 num font-mono">
              {testIds.length} test{testIds.length === 1 ? "" : "s"} selected · approx
              <span className="text-text"> ₹{total.toFixed(0)}</span>
            </p>
          )}
        </Section>

        <Section title="Schedule">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preferred date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                min={new Date().toISOString().slice(0, 10)}
                className={`${inputCls} font-mono num`}
              />
              {date && isBlackedOut(date) && (
                <span className="text-[11px] text-brand mt-1 block">
                  Lab is closed on that date.
                </span>
              )}
            </Field>
            <Field label="Preferred slot">
              {availableSlots.length === 0 ? (
                <p className="text-[12.5px] text-brand py-2">
                  No slots available — pick another date.
                </p>
              ) : (
                <select
                  value={slot}
                  onChange={(e) => setSlot(e.target.value as Slot)}
                  className={inputCls}
                >
                  {availableSlots.map((s) => (
                    <option key={s} value={s}>
                      {slotLabel(s)}
                    </option>
                  ))}
                </select>
              )}
              {requiredSlots && restrictedTest?.collectionTimeRestriction && (
                <p className="text-[11px] text-muted mt-1.5 leading-snug">
                  {restrictedTest.collectionTimeRestriction === "FastingMorningOnly"
                    ? `${restrictedTest.name} requires fasting — last meal at least 10 hours before collection. Slot fixed to Morning.`
                    : `${restrictedTest.name} is collected in the ${restrictionLabel(restrictedTest.collectionTimeRestriction).replace(", ", " ")} window only.`}
                </p>
              )}
            </Field>
          </div>
          <Field label="Notes · optional">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="Anything the phlebotomist should know"
            />
          </Field>
        </Section>

        <div className="pt-2 border-t border-line">
          <Field label={captchaQuestion || "Loading captcha…"}>
            <input
              type="number"
              inputMode="numeric"
              value={captchaAnswer}
              onChange={(e) => setCaptchaAnswer(e.target.value)}
              required
              disabled={!captchaToken}
              className={`${inputCls} font-mono num`}
              aria-label="Captcha answer"
              placeholder="Your answer"
            />
            <span className="text-[11px] text-muted mt-1 block">
              Quick spam check.
            </span>
          </Field>
        </div>

        {error && (
          <div className="rounded-lg border border-brand/40 bg-brand-soft text-[13px] text-text px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          className="w-full rounded-lg bg-brand text-brand-fg py-3 text-[14.5px] font-semibold tap hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Request home visit"}
        </button>

        <p className="text-[11px] text-muted text-center">
          By submitting you allow us to call you about this booking. No promotional
          messages.
        </p>
      </form>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
        {title}
      </p>
      {children}
    </section>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[12px] text-soft mb-1.5">{label}</span>
      {children}
    </label>
  );
}
