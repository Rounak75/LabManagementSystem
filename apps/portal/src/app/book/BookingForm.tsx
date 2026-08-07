"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isOpenNow,
  slotLabel,
  restrictionLabel,
  type LabConfig,
  type ClosureRow,
  type Slot,
  type CollectionTimeRestriction,
} from "@portal/lib/lab-status";
import { localWeekday, localMonth } from "@portal/lib/format";
import {
  Card,
  Note,
  Tag,
  btnPrimary,
  btnSecondary,
  fieldLabel,
  hintCls,
  inputCls,
} from "@portal/components/ui";
import {
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Close,
  Phone,
  Plus,
  Search,
  Shield,
  User,
  Vial,
} from "@portal/components/icons";
import { onlyPopular } from "@portal/components/popular-tests";
import { INVALID_PHONE_MESSAGE, isValidMobile } from "@portal/lib/phone";

interface Test {
  id: string;
  name: string;
  price: number;
  category: string;
  collectionTimeRestriction: CollectionTimeRestriction;
}

// How many days of one-tap date chips to offer. Anything further out still
// works — the calendar input below the rail takes any future date.
const RAIL_DAYS = 14;

// The signed puzzle is good for ten minutes; replace it well inside that so a
// slow form never submits against a dead one.
const CAPTCHA_REFRESH_MS = 7 * 60_000;

/** "9876543210" → "98765 43210". Grouped so the patient reads the number back
 *  instead of skimming ten digits they already believe are right. */
function spacedPhone(p: string): string {
  return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}

/** Local YYYY-MM-DD. Never `toISOString`, which would roll the date back
 *  before 5:30am IST and offer the patient yesterday. */
function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

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
    toggleTest, isBlackedOut, validate, submitBooking, setError
  } = actions;

  // Last stop before submitting: the number is read back so a typo is caught
  // here rather than by a phlebotomist ringing a stranger.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  // A first digit outside 6–9 can never become a mobile number, so it is called
  // out on that keystroke. Length, by contrast, is only wrong once they have
  // stopped typing — complaining at four digits would flag every number twice.
  const phoneInvalid =
    phone.length > 0 &&
    !isValidMobile(phone) &&
    (!/^[6-9]/.test(phone) || phone.length === 10);

  const [filter, setFilter] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // "Today" is resolved after mount only. The server runs in UTC and the
  // patient's phone in IST, so building the rail during SSR would hand React
  // two different sets of dates to reconcile.
  const [todayIso, setTodayIso] = useState<string | null>(null);
  useEffect(() => {
    setTodayIso(ymd(new Date()));
  }, []);

  const days = useMemo(() => {
    if (!todayIso) return [];
    const start = new Date(`${todayIso}T00:00:00`);
    return Array.from({ length: RAIL_DAYS }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        iso: ymd(d),
        day: d.getDate(),
        weekday: localWeekday(d),
        month: localMonth(d),
      };
    });
  }, [todayIso]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dropdownOpen]);

  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  // Distinguishes "still loading" from "the request failed". Without it a
  // failed fetch leaves the submit button disabled forever with nothing on
  // screen to explain why.
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const captchaIssuedAt = useRef(0);

  const refreshCaptcha = useCallback(async () => {
    try {
      const res = await fetch("/api/captcha", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (!data?.token) throw new Error("no token");
      setCaptchaQuestion(data.question ?? "");
      setCaptchaToken(data.token);
      setCaptchaAnswer("");
      setCaptchaFailed(false);
      captchaIssuedAt.current = Date.now();
    } catch {
      setCaptchaQuestion("");
      setCaptchaToken("");
      setCaptchaFailed(true);
    }
  }, []);

  useEffect(() => {
    refreshCaptcha();
  }, [refreshCaptcha]);

  // The puzzle is a signed token that expires after ten minutes, and this form
  // is long enough on a phone to outlive one — leaving a patient answering
  // correctly and being refused. Replace it while it is still valid, but only
  // while the box is empty, so a typed answer is never swapped out from under
  // whoever typed it.
  useEffect(() => {
    const timer = setInterval(() => {
      const age = Date.now() - captchaIssuedAt.current;
      if (age > CAPTCHA_REFRESH_MS && captchaAnswer === "") refreshCaptcha();
    }, 60_000);
    return () => clearInterval(timer);
  }, [captchaAnswer, refreshCaptcha]);

  // Which discipline the browse panel is showing. Null means everything, and
  // a search query overrides it entirely.
  const [browseCategory, setBrowseCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const t of tests) if (t.category) seen.add(t.category);
    return [...seen].sort();
  }, [tests]);

  const popular = useMemo(() => onlyPopular(tests, 6), [tests]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const pool = q
      ? tests.filter((t) => t.name.toLowerCase().includes(q))
      : browseCategory
        ? tests.filter((t) => t.category === browseCategory)
        : tests;
    return pool.slice(0, 60);
  }, [tests, filter, browseCategory]);

  /**
   * Adding from a search closes the panel — the patient had one test in mind
   * and has it. Adding while browsing leaves it open, because someone picking
   * from a list is usually picking more than one.
   */
  function addTest(id: string) {
    toggleTest(id);
    if (filter) {
      setFilter("");
      setDropdownOpen(false);
    }
  }

  const labStatus = cfg ? isOpenNow(cfg, closures) : { open: true, reason: null };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Check the form before asking about the phone number. Confirming a number
    // and *then* being told a test is missing wastes the one screen the patient
    // is certain to read carefully.
    const invalid = validate(captchaAnswer);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setConfirmOpen(true);
  }

  function editPhone() {
    setConfirmOpen(false);
    // Land the caret in the field they came back to fix.
    requestAnimationFrame(() => phoneRef.current?.focus());
  }

  // Escape backs out to the form rather than submitting — dismissing a dialog
  // must never be the thing that confirms it.
  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") editPhone();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  async function confirmAndSubmit() {
    setConfirmOpen(false);
    const result = await submitBooking(captchaToken, captchaAnswer);

    if (typeof result === "string") {
      router.push(`/book/confirmation/${result}`);
      return;
    }

    // `null` means the server saw the submission and refused it; `false` means
    // it never left the browser, so the puzzle is still good.
    //
    // This used to read `error` to decide, but `error` is the value captured
    // when this handler was created — `submitBooking` had only just called
    // `setError`, so the check compared against the *previous* error and was
    // false on the first failure. The question therefore never changed, and a
    // patient whose token had expired retried the same dead puzzle forever.
    if (result === null) await refreshCaptcha();
  }

  if (bookingId)
    return (
      <Card className="mt-6 flex items-center gap-4 p-6">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok">
          <Check size={20} />
        </span>
        <div>
          <h2 className="font-heading text-[15.5px] font-bold tracking-snug text-text">
            Booking received — <span className="font-mono num">{bookingId}</span>
          </h2>
          <p className="mt-1 text-[13px] text-muted">Loading your confirmation…</p>
        </div>
      </Card>
    );

  const submitDisabled = submitting || !captchaToken || availableSlots.length === 0;
  const unselected = visible.filter((t) => !testIds.includes(t.id));

  return (
    <div className="space-y-5">
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 p-4 backdrop-blur-[2px] sm:items-center"
          onClick={editPhone}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-phone-title"
            className="w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
          <Card className="pop p-6">
            <div className="flex items-center gap-2.5 text-brand">
              <Phone size={18} />
              <h2
                id="confirm-phone-title"
                className="font-heading text-[16px] font-bold tracking-snug text-text"
              >
                Is this number correct?
              </h2>
            </div>

            <p className="mt-4 text-center font-mono num text-[26px] font-bold tracking-wider text-text">
              {spacedPhone(phone)}
            </p>

            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              We call this number to confirm your collection, and your report
              link goes here. A wrong digit means we cannot reach you.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={editPhone} className={`${btnSecondary} flex-1`}>
                Change number
              </button>
              <button
                type="button"
                autoFocus
                onClick={confirmAndSubmit}
                className={`${btnPrimary} flex-1`}
              >
                Yes, it&apos;s correct
              </button>
            </div>
          </Card>
          </div>
        </div>
      )}

      {/* Sits under the open test menu and over everything else. The menu is
          tall enough to cover the whole of "Pick a time", and without this the
          form behind it stayed at full contrast — two competing layers of
          identical text with nothing to say which one was in front.

          Deliberately outside `dropdownRef`, so a click here counts as a click
          outside and the existing handler closes the menu. */}
      {dropdownOpen && (
        // `!mt-0` because the parent's `space-y-5` would otherwise put a top
        // margin on this. On a fixed box with both top and bottom pinned that
        // margin is not collapsed away — it shifts the whole scrim down and
        // leaves an undimmed strip across the top of the screen.
        <div className="scrim fixed inset-0 z-10 !mt-0" aria-hidden />
      )}

      {cfg && !labStatus.open && (
        <Note tone="notice" icon={<Clock size={17} />}>
          <strong className="font-semibold text-text">
            The lab is currently closed.
          </strong>
          {labStatus.reason ? ` ${labStatus.reason}.` : null} You can still submit
          a booking — staff will call to confirm during open hours.
        </Note>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ─── 1. Patient details ─────────────────────────────────────── */}
        <Section step={1} title="Patient details" icon={<User size={18} />}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Full name" required className="md:col-span-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputCls}
                placeholder="Full name, as it should print on the report"
              />
            </Field>
            <Field
              label="Phone number"
              required
              hint={
                phoneInvalid ? undefined : "10 digits — we call this number to confirm"
              }
            >
              <input
                ref={phoneRef}
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                required
                aria-invalid={phoneInvalid}
                className={`${inputCls} font-mono num ${
                  phoneInvalid ? "border-rose-400 focus:border-rose-500" : ""
                }`}
                placeholder="9876543210"
              />
              {phoneInvalid && (
                <span className={`${hintCls} text-rose-600`}>{INVALID_PHONE_MESSAGE}</span>
              )}
            </Field>
            <Field label="Email" hint="Optional">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="name@example.com — for a copy of the report"
              />
            </Field>
            <Field label="Collection address" required className="md:col-span-2">
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                rows={2}
                className={`${inputCls} resize-none`}
                placeholder="House no., street, locality — and a landmark we can find"
              />
            </Field>
            <Field label="PIN code" required hint="6 digits — needed so the phlebotomist can find you">
              <input
                type="text"
                inputMode="numeric"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                maxLength={6}
                required
                className={`${inputCls} font-mono num`}
                placeholder="e.g. 831003"
              />
            </Field>
          </div>
        </Section>

        {/* ─── 2. Tests ───────────────────────────────────────────────── */}
        <Section step={2} title="Choose tests" icon={<Vial size={18} />}>
          <div ref={dropdownRef} className="relative z-20">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setDropdownOpen(true);
                setBrowseCategory(null);
              }}
              onFocus={() => setDropdownOpen(true)}
              onClick={() => {
                if (!filter) setDropdownOpen((prev) => !prev);
                else setDropdownOpen(true);
              }}
              placeholder={`Search ${tests.length} tests — “thyroid”, “CBC”…`}
              aria-label="Search tests"
              className={`${inputCls} rounded-full pl-11 pr-12`}
            />
            <button
              type="button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              aria-label="Toggle test list"
              className="tap absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-brand"
            >
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ease-out-fluid ${
                  dropdownOpen ? "rotate-180 text-brand" : ""
                }`}
              />
            </button>

            {dropdownOpen && (
              <div className="pop popover absolute z-20 mt-2 w-full overflow-hidden rounded-2xl">
                {/* Browsing by discipline, for anyone who arrived without a
                    name to type. Hidden once a search is under way — then the
                    query is the filter. */}
                {!filter && categories.length > 0 && (
                  <div className="rail flex gap-1.5 overflow-x-auto border-b border-line-pop px-3 py-2.5">
                    <DropdownChip
                      active={browseCategory === null}
                      onClick={() => setBrowseCategory(null)}
                      label="All"
                    />
                    {categories.map((c) => (
                      <DropdownChip
                        key={c}
                        active={browseCategory === c}
                        onClick={() => setBrowseCategory(c)}
                        label={c}
                      />
                    ))}
                  </div>
                )}

                <div className="max-h-64 overflow-y-auto">
                  {unselected.length === 0 ? (
                    <p className="px-5 py-6 text-center text-[13px] text-muted">
                      Nothing left to add here — try another search.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line-pop">
                      {unselected.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => addTest(t.id)}
                            className="tap flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-pop-hover"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-medium text-text">
                                {t.name}
                              </span>
                              <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                                {t.category}
                                {t.collectionTimeRestriction && (
                                  <span className="text-notice">
                                    {" · "}
                                    {restrictionLabel(t.collectionTimeRestriction)}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono num text-[13.5px] text-soft">
                              ₹{t.price.toFixed(0)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ─── For anyone who doesn't know what to search for ────────── */}
          {!filter && !dropdownOpen && popular.length > 0 && (
            <div className="mt-4 rounded-2xl bg-surface p-4">
              <p className="text-[13px] font-semibold text-text">
                Not sure what you need?
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                These are what people ask for most. Tap to add — you can remove
                anything before you submit, and staff confirm the list on the
                phone.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {popular.map((t) => {
                  const chosen = testIds.includes(t.id);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => addTest(t.id)}
                        disabled={chosen}
                        className={`tap inline-flex items-center gap-1.5 rounded-full border py-2 pl-3 pr-3.5 text-[12.5px] font-medium ${
                          chosen
                            ? "cursor-default border-ok/30 bg-ok-soft text-ok"
                            : "border-line bg-elev text-soft hover:border-brand/40 hover:text-brand"
                        }`}
                      >
                        {chosen ? <Check size={13} /> : <Plus size={13} />}
                        {t.name}
                        <span className="font-mono num text-[11.5px] text-muted">
                          ₹{t.price.toFixed(0)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setBrowseCategory(null);
                    setDropdownOpen(true);
                  }}
                  className="tap inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3.5 py-2 text-[12.5px] font-semibold text-brand hover:bg-brand hover:text-brand-fg"
                >
                  <Vial size={13} />
                  Browse all {tests.length} tests
                </button>
                <a
                  href="tel:6202924306"
                  className="tap inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-medium text-soft hover:text-brand"
                >
                  <Phone size={13} />
                  Ask the lab what to book
                </a>
              </div>
            </div>
          )}

          {testIds.length > 0 && (
            <div className="mt-4">
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {selectedTests.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 px-4 py-3 text-[14px]"
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                      <Check size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-text">
                      {t.name}
                    </span>
                    <span className="shrink-0 font-mono num text-[13.5px] text-soft">
                      ₹{t.price.toFixed(0)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleTest(t.id)}
                      title={`Remove ${t.name}`}
                      aria-label={`Remove ${t.name}`}
                      className="tap inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-alert-soft hover:text-alert"
                    >
                      <Close size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between px-1 text-[13px]">
                <span className="text-muted">
                  {testIds.length} test{testIds.length === 1 ? "" : "s"} selected
                </span>
                <span className="text-muted">
                  approx{" "}
                  <strong className="font-mono num text-[15px] font-semibold text-text">
                    ₹{total.toFixed(0)}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </Section>

        {/* ─── 3. Schedule ────────────────────────────────────────────── */}
        <Section step={3} title="Pick a time" icon={<Calendar size={18} />}>
          <p className={fieldLabel}>Preferred date</p>
          <ul className="rail -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {/* Placeholders hold the row's height until `todayIso` resolves,
                so the section below doesn't jump on hydration. */}
            {days.length === 0 &&
              Array.from({ length: 7 }, (_, i) => (
                <li key={`skeleton-${i}`} className="shrink-0" aria-hidden>
                  <div className="h-[68px] w-[58px] rounded-2xl border border-line bg-surface" />
                </li>
              ))}
            {days.map((d) => {
              const closed = isBlackedOut(d.iso);
              const active = date === d.iso;
              return (
                <li key={d.iso} className="shrink-0">
                  <button
                    type="button"
                    disabled={closed}
                    onClick={() => setDate(d.iso)}
                    aria-pressed={active}
                    className={`tap flex h-[68px] w-[58px] flex-col items-center justify-center gap-0.5 rounded-2xl border ${
                      active
                        ? "border-brand bg-brand text-brand-fg shadow-card"
                        : closed
                        ? "cursor-not-allowed border-line bg-surface text-muted/50 line-through"
                        : "border-line bg-surface text-text hover:border-brand/40"
                    }`}
                  >
                    <span className="font-mono num text-[19px] font-semibold leading-none">
                      {d.day}
                    </span>
                    <span
                      className={`text-[10.5px] font-medium leading-none ${
                        active ? "text-brand-fg/80" : "text-muted"
                      }`}
                    >
                      {d.weekday}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <details className="mt-3">
            <summary className="tap cursor-pointer text-[12.5px] font-medium text-brand hover:opacity-80">
              Need a date further out?
            </summary>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={todayIso ?? undefined}
              aria-label="Preferred date"
              className={`${inputCls} mt-3 font-mono num`}
            />
          </details>

          {date && isBlackedOut(date) && (
            <p className="mt-3 text-[12.5px] font-medium text-alert">
              The lab is closed on that date — please pick another.
            </p>
          )}

          <div className="mt-6">
            <p className={fieldLabel}>Preferred slot</p>
            {availableSlots.length === 0 ? (
              <p className="text-[13px] font-medium text-alert">
                No slots available on that date — pick another.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {availableSlots.map((s) => {
                  const active = slot === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSlot(s)}
                      aria-pressed={active}
                      className={`tap rounded-full border px-4 py-3 text-[13px] font-semibold ${
                        active
                          ? "border-brand bg-brand text-brand-fg shadow-card"
                          : "border-line bg-surface text-soft hover:border-brand/40 hover:text-brand"
                      }`}
                    >
                      {slotLabel(s)}
                    </button>
                  );
                })}
              </div>
            )}
            {requiredSlots && restrictedTest?.collectionTimeRestriction && (
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                {restrictedTest.collectionTimeRestriction === "FastingMorningOnly"
                  ? `${restrictedTest.name} requires fasting — last meal at least 10 hours before collection. Slot fixed to Morning.`
                  : `${restrictedTest.name} is collected in the ${restrictionLabel(restrictedTest.collectionTimeRestriction).replace(", ", " ")} window only.`}
              </p>
            )}
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-baseline justify-between">
              <span className={`${fieldLabel} mb-0`}>Notes for the phlebotomist</span>
              <span className="font-mono num text-[11.5px] text-muted">
                {notes.length}
              </span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="Which floor, who to ask for, anything that helps them find you"
            />
          </div>
        </Section>

        {/* ─── 4. Confirm ─────────────────────────────────────────────── */}
        <Section step={4} title="Confirm it’s you" icon={<Shield size={18} />}>
          {captchaFailed ? (
            <Note tone="notice" icon={<Shield size={17} />}>
              <span className="font-semibold text-text">
                The spam check didn’t load.
              </span>{" "}
              Without it we can’t accept the booking.{" "}
              <button
                type="button"
                onClick={refreshCaptcha}
                className="font-semibold text-brand underline underline-offset-2"
              >
                Try again
              </button>
              , or call the lab on{" "}
              <a href="tel:6202924306" className="font-medium text-brand hover:underline">
                6202924306
              </a>
              .
            </Note>
          ) : (
            <Field
              label={captchaQuestion || "Loading question…"}
              required
              hint="A quick spam check."
            >
              <input
                type="text"
                inputMode="numeric"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value.replace(/[^\d-]/g, ""))}
                required
                disabled={!captchaToken}
                className={`${inputCls} font-mono num`}
                aria-label="Answer to the spam check"
                placeholder="Type the number"
              />
            </Field>
          )}
        </Section>

        {error && (
          <div className="rounded-2xl bg-alert-soft px-4 py-3.5 text-[13px] leading-relaxed text-text">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            type="submit"
            disabled={submitDisabled}
            className={`${btnPrimary} w-full py-4`}
          >
            {submitting ? "Submitting…" : "Request home visit"}
          </button>
          <p className="px-4 text-center text-[12px] leading-relaxed text-muted">
            By submitting you allow us to call you about this booking. No
            promotional messages.
          </p>
        </div>
      </form>
    </div>
  );
}

/* ─────────────────────────── components ──────────────────────────── */

function DropdownChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium ${
        active
          ? "bg-brand text-brand-fg"
          : "bg-pop-hover text-soft hover:text-brand"
      }`}
    >
      {label}
    </button>
  );
}

function Section({
  title,
  step,
  icon,
  children,
}: {
  title: string;
  step: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card as="section" className="p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3 border-b border-line pb-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          {icon}
        </span>
        <h3 className="flex-1 font-heading text-[16px] font-bold tracking-snug text-text">
          {title}
        </h3>
        <span className="shrink-0">
          <Tag>Step {step}</Tag>
        </span>
      </div>
      {children}
    </Card>
  );
}

/**
 * A labelled input.
 *
 * `required` marks the label rather than leaving it implied. The form used to
 * signal it only by the *absence* of the word "Optional" on the one field that
 * had it, which reads as nothing at all — an empty box with no marking looks
 * skippable, and PIN code was skipped often enough to reach the phlebotomist.
 */
function Field({
  label,
  hint,
  required = false,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className={fieldLabel}>
        {label}
        {required && (
          <span className="ml-0.5 text-rose-500" title="Required">
            *
          </span>
        )}
      </span>
      {children}
      {hint && <span className={hintCls}>{hint}</span>}
    </label>
  );
}
