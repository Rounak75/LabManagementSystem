// Shared surface vocabulary for the patient portal.
//
// The portal is built from four surfaces and nothing else: the deep-teal
// `Band` a page opens with, the white `Card` that carries content, the
// recessed `surface` strip inside a card, and the pale-teal chip. Keeping
// that list short is what makes twelve screens read as one product.
//
// Every component here is presentational and server-safe — no state, no
// effects — so server pages can render them directly.

import Link from "next/link";
import { ArrowLeft, ArrowRight, Info } from "./icons";

/* ─── Layout ─────────────────────────────────────────────────────── */

export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  // Reading width on a phone, a little more room on a large screen — enough
  // that card grids stop looking stranded, short of a sprawling dashboard.
  //
  // `relative` is load-bearing: `Band` is positioned so it can hold the wave
  // layers, and a positioned element paints above static siblings whatever
  // the source order. Without this, every page that pulls its first card up
  // into the band renders that card *behind* it.
  return (
    <div className={`relative mx-auto w-full max-w-3xl px-4 sm:px-6 lg:max-w-4xl ${className}`}>
      {children}
    </div>
  );
}

/**
 * The deep-teal header every page opens with. Full-bleed, curved at the
 * bottom, and sized so the first card can be pulled up into it.
 */
export function Band({
  children,
  className = "",
  waves = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Decoration for bands with little in them. See `BandWaves`. */
  waves?: boolean;
}) {
  return (
    <div className={`band relative overflow-hidden rounded-b-band shadow-band ${className}`}>
      {waves && <BandWaves />}
      {/* Content sits above the decoration without needing its own stacking
          rules on every page. */}
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * Three drifting wave layers along the foot of a band.
 *
 * Pure SVG — nothing to download, and it scales to any width. Each layer
 * carries two periods across the viewBox and slides by half its own width,
 * so the loop is seamless. Fill is white at low alpha, which reads correctly
 * against the deep teal in both day and night mode.
 *
 * `preserveAspectRatio="none"` means each layer stretches the same curve to
 * its own height, so amplitude scales with the layer — the heights below are
 * the only thing setting how tall the crests read.
 *
 * The path is repeated per layer rather than shared through `<defs>` + `<use>`.
 * Sharing was measured at roughly 400 bytes a page, which does not pay for a
 * document-global id in a component that renders twice while a skeleton is
 * still on screen.
 */
export function BandWaves() {
  // Tallest and slowest at the back, shortest and quickest at the front. The
  // ratios (100% / 67% / 44%) are what produce the parallax; changing the
  // container height alone keeps them intact.
  const layers = [
    { tone: "text-white/[0.06]", duration: "31s", height: "h-36 sm:h-48" },
    { tone: "text-white/[0.05]", duration: "23s", height: "h-24 sm:h-32" },
    { tone: "text-white/[0.09]", duration: "17s", height: "h-16 sm:h-20" },
  ];

  return (
    <div
      aria-hidden
      // `contain: paint` tells the browser nothing inside can paint outside
      // this box, so the three animating layers cannot dirty the band above.
      style={{ contain: "paint" }}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-36 overflow-hidden sm:h-48"
    >
      {layers.map((layer, i) => (
        <svg
          key={i}
          viewBox="0 0 1440 160"
          preserveAspectRatio="none"
          style={{ animationDuration: layer.duration }}
          className={`wave absolute bottom-0 left-0 w-[200%] ${layer.height} ${layer.tone}`}
        >
          {/* Two periods across the viewBox — see the note on `.wave`. */}
          <path
            fill="currentColor"
            d="M0,80 C120,52 240,52 360,80 C480,108 600,108 720,80 C840,52 960,52 1080,80 C1200,108 1320,108 1440,80 L1440,160 L0,160 Z"
          />
        </svg>
      ))}
    </div>
  );
}

/**
 * Band header for interior pages: back arrow on the left, centred title,
 * optional trailing action. Mirrors the "Queue Details" bar.
 */
export function BandBar({
  back,
  title,
  action,
}: {
  back?: { href: string; label: string };
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 pb-1 pt-5">
      {back ? (
        <Link
          href={back.href}
          aria-label={back.label}
          className="tap inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-band/90 hover:bg-white/10 hover:text-band"
        >
          <ArrowLeft size={19} />
        </Link>
      ) : (
        <span className="h-11 w-11 shrink-0" aria-hidden />
      )}
      <h1 className="min-w-0 flex-1 truncate text-center font-heading text-[16.5px] font-semibold tracking-snug text-band sm:text-[18px]">
        {title}
      </h1>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">
        {action}
      </span>
    </div>
  );
}

/* ─── Cards ──────────────────────────────────────────────────────── */

export function Card({
  children,
  className = "",
  style,
  as: As = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Mostly for `--i`, the stagger index read by the `.rise` animation. */
  style?: React.CSSProperties;
  as?: "div" | "section" | "li" | "article";
}) {
  return (
    <As
      style={style}
      className={`rounded-3xl border border-line bg-elev shadow-card ${className}`}
    >
      {children}
    </As>
  );
}

/** A card that lives *inside* the band — translucent white over teal. */
export function BandCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl bg-white/10 p-1.5 ring-1 ring-inset ring-white/15 backdrop-blur-[2px] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHead({
  title,
  href,
  linkLabel = "See all",
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="font-heading text-[17px] font-bold tracking-snug text-text">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="tap inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand hover:opacity-80"
        >
          {linkLabel}
          <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}

/* ─── Chips & small parts ────────────────────────────────────────── */

/** Circular pale-teal plate behind a hairline icon. */
export function IconChip({
  children,
  size = "md",
  tone = "brand",
}: {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "brand" | "ok" | "notice" | "alert";
}) {
  const box =
    size === "lg" ? "h-14 w-14" : size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const tones = {
    brand: "bg-brand-soft text-brand",
    ok: "bg-ok-soft text-ok",
    notice: "bg-notice-soft text-notice",
    alert: "bg-alert-soft text-alert",
  } as const;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${box} ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Small state label — the grey capsules under the doctor's name. */
export function Tag({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "ok" | "notice" | "alert";
}) {
  const tones = {
    neutral: "bg-surface text-soft",
    brand: "bg-brand-soft text-brand",
    ok: "bg-ok-soft text-ok",
    notice: "bg-notice-soft text-notice",
    alert: "bg-alert-soft text-alert",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone }: { tone: "ok" | "notice" | "alert" }) {
  const tones = {
    ok: "bg-ok text-ok",
    notice: "bg-notice text-notice",
    alert: "bg-alert text-alert",
  } as const;
  return (
    <span
      className={`dot-pulse relative inline-block h-2 w-2 shrink-0 rounded-full ${tones[tone]}`}
    />
  );
}

/** Pale, low-stakes explanation. The blue note under the QR code. */
export function Note({
  children,
  tone = "brand",
  icon,
}: {
  children: React.ReactNode;
  tone?: "brand" | "ok" | "notice" | "alert";
  icon?: React.ReactNode;
}) {
  const tones = {
    brand: "bg-brand-soft text-soft",
    ok: "bg-ok-soft text-soft",
    notice: "bg-notice-soft text-soft",
    alert: "bg-alert-soft text-soft",
  } as const;
  const iconTone = {
    brand: "text-brand",
    ok: "text-ok",
    notice: "text-notice",
    alert: "text-alert",
  } as const;
  return (
    <div className={`flex gap-3 rounded-2xl px-4 py-3.5 ${tones[tone]}`}>
      <span className={`mt-px shrink-0 ${iconTone[tone]}`}>
        {icon ?? <Info size={17} />}
      </span>
      <div className="text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

/** Label above, value below — the Patient / Queue / Date row. */
export function Fact({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-[14.5px] font-semibold text-text">{value}</p>
    </div>
  );
}

/* ─── Class recipes ──────────────────────────────────────────────────
   Shared as strings rather than components so a page can drop them on
   whatever element it already needs (Link, a, button, input).        */

export const btnPrimary =
  "tap inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 text-[14.5px] font-semibold text-brand-fg shadow-card hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50";

export const btnSecondary =
  "tap inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-elev px-5 py-3.5 text-[14.5px] font-semibold text-text hover:border-brand/40 hover:text-brand disabled:pointer-events-none disabled:opacity-50";

/** White pill on the teal band. */
export const btnOnBand =
  "tap inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-[13.5px] font-semibold text-brand-deep hover:bg-white/90";

/**
 * 16px is not a taste decision — it is the threshold. Safari on iOS zooms the
 * whole page in when a field it is focusing computes to anything smaller, and
 * it does not zoom back out afterwards: the patient is left pinching their way
 * back to a legible layout, once per field. At the previous 15px that fired on
 * every box in the portal, and the booking form has nine of them.
 *
 * Any new field must go through this recipe, or carry a size of its own that
 * is >= 16px. `select` and `textarea` are covered by the same rule.
 */
export const inputCls =
  "block w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-[16px] text-text placeholder:text-muted tap focus:border-brand focus:bg-elev focus:outline-none focus:ring-4 focus:ring-brand/10";

export const fieldLabel = "mb-2 block text-[13px] font-semibold text-soft";

export const hintCls = "mt-2 block text-[12px] leading-relaxed text-muted";
