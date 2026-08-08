"use client";

// The catalogue runs to a few hundred rows. Rendering all of them buried the
// useful ones under a scrollbar, so this pages through them instead: search,
// filter by discipline, ten at a time. Every row the server sent is still
// reachable — this only changes how many are on screen at once.

import { useEffect, useMemo, useState } from "react";
import { Card, Note, Tag, inputCls } from "@portal/components/ui";
import { CategoryIcon } from "@portal/components/category-icon";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Close,
  Search,
} from "@portal/components/icons";

export interface CatalogueTest {
  id: string;
  name: string;
  category: string;
  restriction: string | null;
}

const PAGE_SIZE = 10;
const ALL = "All";

export function TestCatalogue({
  tests,
  categories,
}: {
  tests: CatalogueTest[];
  categories: string[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [page, setPage] = useState(1);
  // Which way the next page should arrive from. Set on every page change so
  // the list reads as one strip sliding, not a panel being replaced.
  const [dir, setDir] = useState(1);

  // `/tests#hematology` links from the landing page predate the filter, and
  // people bookmark them. Honour the hash on arrival instead of breaking it.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!hash) return;
    const hit = categories.find((c) => slug(c) === hash);
    if (hit) setCategory(hit);
  }, [categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tests.filter((t) => {
      if (category !== ALL && t.category !== category) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tests, query, category]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Narrowing the filter can strand you past the last page — clamp rather
  // than showing an empty list that looks like "no results".
  const current = Math.min(page, pageCount);
  const slice = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function goTo(next: number) {
    const clamped = Math.min(Math.max(1, next), pageCount);
    if (clamped === current) return;
    setDir(clamped > current ? 1 : -1);
    setPage(clamped);
  }

  function reset(fn: () => void) {
    setDir(1);
    setPage(1);
    fn();
  }

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tests) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return m;
  }, [tests]);

  return (
    <div className="space-y-5">
      {/* ─── Search ─────────────────────────────────────────────────── */}
      <div className="relative">
        <Search
          size={18}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => reset(() => setQuery(e.target.value))}
          // Test names are not words a phone keyboard has opinions worth
          // hearing about. Left alone it capitalises "cbc" and autocorrects
          // "creatinine" into something that matches nothing.
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={`Search ${tests.length} tests — “thyroid”, “CBC”…`}
          aria-label="Search tests"
          className={`${inputCls} rounded-full pl-11 pr-12 shadow-card`}
        />
        {query && (
          <button
            type="button"
            onClick={() => reset(() => setQuery(""))}
            aria-label="Clear search"
            className="tap hit absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-brand"
          >
            <Close size={16} />
          </button>
        )}
      </div>

      {/* ─── Discipline filter ──────────────────────────────────────── */}
      <nav aria-label="Filter by discipline">
        <ul className="rail -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <li className="shrink-0">
            <FilterChip
              active={category === ALL}
              onClick={() => reset(() => setCategory(ALL))}
              label="All tests"
              count={tests.length}
            />
          </li>
          {categories.map((c) => (
            <li key={c} className="shrink-0">
              <FilterChip
                active={category === c}
                onClick={() => reset(() => setCategory(c))}
                label={c}
                count={counts.get(c) ?? 0}
                icon={<CategoryIcon category={c} size={15} />}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* ─── Results ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <Note tone="notice">
          No test matches “{query}”
          {category !== ALL ? ` in ${category}` : ""}. Try a shorter search, or{" "}
          <a href="tel:6202924306" className="font-medium text-brand hover:underline">
            call the lab
          </a>{" "}
          — most outsourced tests can be arranged the same day.
        </Note>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-4 px-1">
            <p className="text-[12.5px] text-muted">
              <span className="font-mono num font-medium text-text">
                {filtered.length}
              </span>{" "}
              {filtered.length === 1 ? "test" : "tests"}
              {category !== ALL && <> in {category}</>}
            </p>
            {pageCount > 1 && (
              <p className="font-mono num text-[12px] text-muted">
                {current} / {pageCount}
              </p>
            )}
          </div>

          <Card className="overflow-hidden">
            {/* Keyed on the page so the animation restarts cleanly each time. */}
            <ul
              key={`${category}-${query}-${current}`}
              className="shift divide-y divide-line"
              style={{ "--shift": dir > 0 ? "14px" : "-14px" } as React.CSSProperties}
            >
              {slice.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand sm:inline-flex">
                      <CategoryIcon category={t.category} size={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] text-text">{t.name}</p>
                      {category === ALL && (
                        <p className="mt-0.5 truncate text-[11.5px] text-muted">
                          {t.category}
                        </p>
                      )}
                    </div>
                  </div>
                  {restrictionTag(t.restriction) && (
                    <span className="shrink-0">
                      <Tag tone="notice">
                        <Clock size={12} />
                        <span className="hidden sm:inline">
                          {restrictionTag(t.restriction)}
                        </span>
                      </Tag>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {pageCount > 1 && (
            <Pager current={current} pageCount={pageCount} goTo={goTo} />
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── components ──────────────────────────── */

function FilterChip({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`tap inline-flex items-center gap-2 rounded-full border py-2 pl-2.5 pr-3.5 text-[13px] font-medium ${
        active
          ? "border-brand bg-brand text-brand-fg shadow-card"
          : "border-line bg-elev text-soft hover:border-brand/40 hover:text-brand"
      }`}
    >
      {icon && (
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
            active ? "bg-white/20" : "bg-brand-soft text-brand"
          }`}
        >
          {icon}
        </span>
      )}
      {label}
      <span
        className={`font-mono num text-[11.5px] ${
          active ? "text-brand-fg/70" : "text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function Pager({
  current,
  pageCount,
  goTo,
}: {
  current: number;
  pageCount: number;
  goTo: (n: number) => void;
}) {
  return (
    <nav aria-label="Catalogue pages" className="flex items-center justify-between gap-3">
      <PagerArrow
        label="Previous page"
        disabled={current === 1}
        onClick={() => goTo(current - 1)}
      >
        <ArrowLeft size={16} />
        <span className="hidden sm:inline">Previous</span>
      </PagerArrow>

      {/* Numbers on a comfortable screen; a plain counter on a phone, where
          eight tap targets in a row is a mis-tap waiting to happen. */}
      <ul className="hidden items-center gap-1.5 sm:flex">
        {pageNumbers(current, pageCount).map((n, i) =>
          n === "gap" ? (
            <li key={`gap-${i}`} className="px-1 text-[13px] text-muted" aria-hidden>
              …
            </li>
          ) : (
            <li key={n}>
              <button
                type="button"
                onClick={() => goTo(n)}
                aria-label={`Page ${n}`}
                aria-current={n === current ? "page" : undefined}
                className={`tap inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 font-mono num text-[13px] font-medium ${
                  n === current
                    ? "bg-brand text-brand-fg shadow-card"
                    : "text-soft hover:bg-surface hover:text-brand"
                }`}
              >
                {n}
              </button>
            </li>
          )
        )}
      </ul>

      <p className="font-mono num text-[13px] text-muted sm:hidden">
        {current} / {pageCount}
      </p>

      <PagerArrow
        label="Next page"
        disabled={current === pageCount}
        onClick={() => goTo(current + 1)}
      >
        <span className="hidden sm:inline">Next</span>
        <ArrowRight size={16} />
      </PagerArrow>
    </nav>
  );
}

function PagerArrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="tap inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line bg-elev px-4 text-[13px] font-semibold text-soft shadow-card hover:border-brand/40 hover:text-brand disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── helpers ─────────────────────────────── */

/** First, last, and a window around the current page. */
function pageNumbers(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const out: (number | "gap")[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);

  if (from > 2) out.push("gap");
  for (let n = from; n <= to; n++) out.push(n);
  if (to < total - 1) out.push("gap");
  out.push(total);

  return out;
}

function restrictionTag(r: string | null): string | null {
  if (r === "FastingMorningOnly") return "Fasting · morning";
  if (r === "MorningOnly") return "Morning only";
  if (r === "EveningOnly") return "Evening only";
  return null;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
