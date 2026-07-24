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

import { useBookingState } from "./useBookingState";

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
  
  const { state, actions } = useBookingState(tests, blackoutDates, cfg, closures);
  const {
    name, phone, email, address, pincode, date, slot, notes, testIds,
    error, submitting, bookingId, selectedTests, total, requiredSlots, restrictedTest, availableSlots
  } = state;
  const {
    setName, setPhone, setEmail, setAddress, setPincode, setDate, setSlot, setNotes,
    toggleTest, isBlackedOut, submitBooking, setError
  } = actions;

  const [filter, setFilter] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

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
    if (!filter.trim()) return tests.slice(0, 50);
    const q = filter.toLowerCase();
    return tests.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 50);
  }, [tests, filter]);

  const labStatus = cfg ? isOpenNow(cfg, closures) : { open: true, reason: null };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const createdBookingId = await submitBooking(captchaToken, captchaAnswer);
    if (createdBookingId) {
      router.push(`/book/confirmation/${createdBookingId}`);
    } else {
      if (error === "That answer wasn't right. Please try the new question.") {
        await refreshCaptcha();
      }
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
    "block w-full rounded-xl bg-surface border border-line/80 px-4 py-3 text-[15px] text-text placeholder:text-muted focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/10 transition-all duration-300 ease-out-fluid shadow-inner-bezel-dark hover:border-line hover:bg-elev";

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
        className="space-y-8"
      >
        <Section title="Patient Details" step={1}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full name" className="md:col-span-2">
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
            <Field label="Collection address" className="md:col-span-2">
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

        <Section title="Test Selection" step={2}>
          <div className="relative group z-20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-soft group-focus-within:text-brand transition-colors">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setSearchFocused(true);
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              placeholder="Search or select tests..."
              className={`${inputCls} pl-10 pr-10`}
            />
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              className={`absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-soft transition-transform duration-200 cursor-pointer ${searchFocused ? "rotate-180 text-brand" : "hover:text-brand"}`}
              onMouseDown={(e) => {
                e.preventDefault();
                setSearchFocused(!searchFocused);
              }}
            >
              <polyline points="6 9 12 15 18 9"/>
            </svg>

            {searchFocused && (filter.length > 0 || visible.length > 0) && (
              <div className="absolute z-20 w-full mt-2 rounded-xl border border-line bg-bg shadow-2xl max-h-72 overflow-y-auto divide-y divide-line animate-in fade-in slide-in-from-top-1 duration-200">
                {visible.map((t) => {
                  const isAlreadySelected = testIds.includes(t.id);
                  if (isAlreadySelected) return null;
                  return (
                    <div
                      key={t.id}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevents input onBlur from firing before click
                        if (!isAlreadySelected) toggle(t.id);
                        setFilter("");
                        setSearchFocused(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 text-[14px] cursor-pointer hover:bg-elev transition-colors"
                    >
                      <span className="flex-1 text-text font-medium">
                        {t.name}
                        {t.collectionTimeRestriction && (
                          <span className="ml-2 text-[11px] font-normal text-notice bg-notice/10 px-1.5 py-0.5 rounded">
                            {restrictionLabel(t.collectionTimeRestriction)}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-soft num">
                        ₹{t.price.toFixed(0)}
                      </span>
                    </div>
                  );
                })}
                {visible.filter(t => !testIds.includes(t.id)).length === 0 && (
                  <p className="px-4 py-4 text-[13px] text-muted text-center italic">No matching tests found (or all matches are already added).</p>
                )}
              </div>
            )}
          </div>
          
          {testIds.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="rounded-xl border border-line divide-y divide-line bg-bg overflow-hidden shadow-sm">
                {selectedTests.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3 text-[14px] bg-bg hover:bg-elev/50 transition-colors">
                     <span className="text-text font-medium">{t.name}</span>
                     <div className="flex items-center gap-4">
                       <span className="font-mono text-soft num">₹{t.price.toFixed(0)}</span>
                       <button type="button" onClick={() => toggle(t.id)} className="text-brand hover:bg-brand/10 p-1.5 rounded-md transition-colors" title="Remove test">
                         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                           <line x1="18" y1="6" x2="6" y2="18" />
                           <line x1="6" y1="6" x2="18" y2="18" />
                         </svg>
                       </button>
                     </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center text-[13px] px-1">
                <span className="text-soft">{testIds.length} test{testIds.length === 1 ? "" : "s"} selected</span>
                <span className="text-soft num font-mono">
                  approx <strong className="text-text text-[14px]">₹{total.toFixed(0)}</strong>
                </span>
              </div>
            </div>
          )}
        </Section>

        <Section title="Schedule Appointment" step={3}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          className="group relative w-full rounded-full bg-brand px-6 py-4 text-center font-semibold text-brand-fg transition-all duration-300 ease-out-fluid hover:-translate-y-1 hover:shadow-ambient active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="relative z-10 flex items-center justify-center gap-2 text-[15px]">
            {submitting ? "Submitting…" : "Request home visit"}
          </span>
        </button>

        <p className="text-[12px] text-soft text-center px-6">
          By submitting you allow us to call you about this booking. No promotional
          messages.
        </p>
      </form>
    </div>
  );
}

function Section({
  title,
  step,
  children,
}: {
  title: string;
  step: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-line/60 bg-elev p-1.5 shadow-ambient">
      <div className="rounded-[1.625rem] bg-bg px-6 py-8 md:px-8 shadow-inner-bezel space-y-6">
        <div className="flex items-center gap-4 border-b border-line/40 pb-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-brand text-[13px] font-bold">
            {step}
          </span>
          <h3 className="font-heading text-xl font-bold tracking-tight text-text">
            {title}
          </h3>
        </div>
        {children}
      </div>
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
      <span className="block text-[13px] font-medium text-text mb-2 tracking-wide uppercase">{label}</span>
      {children}
    </label>
  );
}
