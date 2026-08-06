# Jamshedpur diagnostic test pricing — market survey

**Researched:** 2026-07-28, extended 2026-08-06 · **City:** Jamshedpur, Jharkhand
· **Status:** PANELS PRICED — individual analytes still open

Gathered to reprice the Golmuri Janch Ghar catalogue. Every price below was read
off the live listing page cited beneath it — nothing here is estimated or
interpolated, with exactly one exception that is labelled DERIVED where it
appears. Tests not listed were not reached; see [Gaps](#gaps).

## What changed on 2026-08-06

The second run priced the **panels** — the bundles patients actually order and
shop around for — which the first run had not reached. Three things came out of
it that the July run could not have seen:

1. **The discount depth is not uniform, and July's "46–60% off" was not a rule.**
   Re-reading the same pages in August found CBC at **15% off** and Lipid Profile
   at **10% off**, while LFT+KFT sat at **58%**. Discount depth is per-listing and
   moves. Any repricing rule expressed as "MRP minus X%" would have been built on
   a number that does not hold still.
2. **Two panels were priced above the aggregator's own MRP** — CBC at ₹400
   against an MRP of ₹350, and Lipid Profile at ₹600 against ₹400. The July
   framing assumed the catalogue was broadly underpriced against MRP. For the
   panels, the opposite was true.
3. **Urine Routine is still the outlier**, now confirmed against a second reading:
   ₹100 against a ₹179 booking rate and a ₹448 MRP.

### The repricing rule actually applied

**Catalogue price = midpoint of (aggregator booking rate, MRP).** This replaces
the July decision of "catalogue price = MRP", which the data above no longer
supports — an MRP that moves 10% on one listing and 58% on another is not a
stable anchor, and on the panels it was simply higher than what the lab could
charge.

The midpoint is defensible in both directions: the booking rate is national
customer-acquisition pricing subsidised across a whole book and is not what an
independent neighbourhood lab competes at, while the MRP is set to make the
discount look large. Neither end is the market; the middle approximates it.

## Decision (2026-07-28)

**Catalogue price = MRP.** Discounts are applied per invoice by an admin, not
baked into the catalogue. So every price below is set from the aggregator's
undiscounted MRP, not its promotional rate.

Two operational consequences of this, both verified in the code:

1. **Only an Admin can discount.** `invoices:applyDiscount` calls
   `requireAdmin()` ([invoices.ipc.ts:20](../../apps/desktop/src/main/ipc/invoices.ipc.ts)),
   and the UI section is gated on `user?.role === "Admin"`
   ([InvoiceView.tsx:180](../../apps/desktop/src/renderer/routes/invoices/InvoiceView.tsx)).
   A receptionist or technician cannot reduce a bill. With catalogue prices at
   MRP, a walk-in paying the customary rate needs an admin present at billing.
   If that is not always the case, either widen the role check or keep the
   high-traffic tests below MRP.
2. **Discount is applied after the invoice exists**, against the whole invoice
   subtotal — not per test line. It is audited as `APPLY_DISCOUNT`.

## The headline finding: listed prices are loss-leader prices

Every aggregator page shows two numbers — an MRP and a heavily discounted
"book now" price, typically **46–60% off**:

| Test | Aggregator price | MRP | Discount |
|---|---|---|---|
| Fasting glucose (Apollo) | ₹79 | ₹197 | 60% |
| Urine examination (Apollo) | ₹179 | ₹448 | 60% |
| Thyroid profile (1mg) | ₹299 | ₹550 | 46% |
| PPBS (1mg) | ₹79 | ₹160 | 51% |
| RBS (1mg) | ₹79 | ₹159 | 50% |

These are national home-collection operations buying volume. **The discounted
figure is not the market rate a neighbourhood walk-in lab competes against** —
it is customer-acquisition pricing subsidised across a national book. The MRP is
closer to what an independent lab can sustain.

This matters because the two numbers point opposite ways:

| Test | Current price | Aggregator | MRP | Reading |
|---|---|---|---|---|
| Blood Glucose Fasting | ₹100 | ₹79 | ₹197 | Between the two — arguably fine |
| PP Glucose | ₹100 | ₹79 | ₹160 | Between the two |
| Random Glucose | ₹100 | ₹79 | ₹159 | Between the two |
| Urine Routine Examination | ₹100 | ₹179 | ₹448 | **Underpriced** — below even the discounted rate |
| Thyroid Profile (T3/T4/TSH) | ₹500 | ₹299 | ₹550 | Near MRP |

Matching the aggregator column mechanically would **cut ~20% off the
highest-volume tests** (the three glucose tests) while leaving the one test that
is genuinely underpriced — Urine Routine, at 56% of even the discounted rate —
untouched. That is the opposite of the intended outcome.

## Prices found

| Test | 1mg (₹) | Apollo (₹) | Karexpert (₹) | MRP (₹) | Was (₹) | Now (₹) |
|---|---|---|---|---|---|---|
| Blood Glucose Fasting | not found | 79 | not found | 197 | 100 | **140** |
| PP Glucose (PPBS) | 79 | not found | not found | 160 | 100 | **120** |
| Random Glucose (RBS) | 79 | not found | not found | 159 | 100 | **120** |
| Urine Routine (CUE) | not found | 179 | not found | 448 | 100 | **300** |
| Thyroid Profile (T3/T4/TSH) | 299 | not found | not found | 550 | 500 | **425** |
| TSH Ultrasensitive | 319 | not found | not found | 332 | — (not in catalogue) | — |
| **CBC / Blood Examination** | 299 | not found | not found | 350 | 400 | **325** |
| **Lipid Profile** | 359 | not found | not found | 400 | 600 | **380** |
| **Liver Function Test (LFT)** | 399 | not found | not found | 710 | 700 | **550** |
| **Kidney Function Test (KFT)** | see note | not found | not found | see note | 700 | **550** ᴰ |
| LFT + KFT combined | 649 | not found | not found | 1,547 | — (no such bundle) | — |
| Urea | 119 | not found | not found | 140 | 150 | **130** |
| Creatinine | 149 | not found | not found | 209 | 150 | **180** |
| Uric Acid | 139 | not found | not found | 199 | 150 | **170** |
| Total Bilirubin | 129 | not found | not found | 139 | 100 | **135** |
| SGPT (ALT) | 189 | not found | not found | 200 | 150 | **195** |
| Total Protein | 139 | not found | not found | 199 | 100 | **170** |
| Albumin | 129 | not found | not found | 130 | 100 | **130** |
| Total Cholesterol | 139 | not found | not found | 150 | 150 | **145** |
| Calcium | 159 | not found | not found | 219 | 150 | **190** |
| Potassium | 179 | not found | not found | 199 | 150 | **190** |
| LDH | 319 | not found | not found | 400 | 200 | **360** |
| Amylase | 399 | not found | not found | 485 | 200 | **440** |
| ESR | 109 | not found | not found | 149 | 100 | **130** |
| VDRL (RPR) | 119 | not found | not found | 149 | 150 | **135** |
| Blood Group (ABO+Rh) | 119 | not found | not found | 150 | 50 | **135** |
| Widal (tube agglutination) | 229 | not found | not found | 400 | 200 | **315** |
| CRP (quantitative) | 379 | not found | not found | 449 | 200 | **415** |
| RA Factor (quantitative) | 499 | not found | not found | 500 | 200 | **500** |
| Urine R/M (1mg reading) | 89 | 179 ᴬ | not found | 180 / 448 ᴬ | 100 | **225** |
| Serum Electrolytes (Na+K+Cl) | 359 | not found | not found | 409 | 3×150 | unchanged |
| Viral Markers (HIV+HBsAg+HCV) | 1,709 | not found | not found | 2,000 | 850 | unchanged |
| Dengue NS1 antigen | 589 | not found | not found | 599 | n/a | unchanged |
| Stool Culture & Sensitivity | 739 | not found | not found | not shown | 500 | unchanged |

ᴬ The Urine row carries two readings that disagree by more than 2×: 1mg's Urine
R/M at ₹89 / MRP ₹180, and Apollo's Complete Urine Examination at ₹179 / MRP
₹448. ₹225 is the mean of the two midpoints. Pricing off Apollo alone would have
given ₹300 — which is what the first pass of this repricing did, before the 1mg
reading existed to contradict it.

Bold rows were read on 2026-08-06; the rest on 2026-07-28 and re-confirmed where
the page was revisited (PPBS and Thyroid Profile both still read as they did in
July).

ᴰ **KFT is the one DERIVED figure in this document.** No standalone KFT listing
exists for Jamshedpur — 1mg returns "test not found" for the Jamshedpur variant
of its KFT page, and sells KFT here only inside the LFT+KFT bundle. The ₹550 is
arithmetic: the combined midpoint (₹1,098) minus the LFT midpoint (₹555) leaves
₹543. It is the only price in the catalogue not traceable to a page, and it
should be confirmed against what the lab's own reagent cost supports before it
bills anyone.

### The rate the lab does not offer

The aggregator sells **LFT + KFT together for ₹649**. Golmuri Janch Ghar has no
equivalent bundle: ordering both panels comes to ₹1,100 even after this
repricing, against ₹1,400 before it. A patient who compares will find the gap on
the exact pairing a physician most often orders together. Creating a combined
panel is a catalogue decision rather than a pricing one, so it is recorded here
rather than actioned.

Note: 1mg lists **TSH alone at ₹319 but the full T3/T4/TSH profile at ₹299** —
the panel is cheaper than one of its components. An aggregator packaging quirk,
not a signal to copy.

## Sources

- Fasting glucose, Jamshedpur (Tata Steel Plant Area) — https://www.apollo247.com/lab-tests/glucose-fasting-l-tata-steel-plant-area-c-jamshedpur
- Complete Urine Examination, Jamshedpur (Agrico Area) — https://www.apollo247.com/lab-tests/complete-urine-examination-cue-l-agrico-area-c-jamshedpur
- PPBS, Jamshedpur — https://www.1mg.com/labs/test/ppbs-postprandial-blood-sugar-1784/jamshedpur/price
- RBS, Jamshedpur — https://www.1mg.com/labs/test/rbs-random-blood-sugar-1785/jamshedpur/price
- Thyroid Profile Total, Jamshedpur — https://www.1mg.com/labs/test/thyroid-profile-total-t3-t4-tsh-2571/jamshedpur/price
- TSH Ultrasensitive, Jamshedpur — https://www.1mg.com/labs/test/tsh-thyroid-stimulating-hormone-ultrasensitive-1977/jamshedpur/price

Added 2026-08-06:

- CBC (Complete Blood Count), Jamshedpur — https://www.1mg.com/labs/test/cbc-complete-blood-count-1717/jamshedpur/price — ₹299, MRP ₹350
- Lipid Profile, Jamshedpur — https://www.1mg.com/labs/test/lipid-profile-1909/jamshedpur/price — ₹359, MRP ₹400
- LFT (standalone), Jamshedpur — https://www.1mg.com/labs/test/lft-liver-function-test-2562/jamshedpur/price — ₹399, MRP ₹710
- LFT and KFT (combined), Jamshedpur — https://www.1mg.com/labs/test/lft-and-kft-liver-function-test-kidney-function-test-35075/jamshedpur/price — ₹649, MRP ₹1,547
- KFT (standalone) — https://www.1mg.com/labs/test/kft-kidney-function-test-2561/jamshedpur/price — **returns "Sorry, test not found"** for Jamshedpur; this is the reason the KFT price is derived rather than cited

## Competitor survey, 2026-08-07 — the named labs, not the aggregators

The first two runs read only the national booking platforms (1mg, Apollo). That
left eight duplicated test names unresolvable, because none of those platforms
listed the tests at all. This run went to the diagnostic chains that actually
operate in Jamshedpur.

**Redcliffe Labs publishes Jamshedpur-specific prices** — `redcliffelabs.com/jamshedpur/tests/<test>`.
That makes it the most directly comparable source in this whole document: a real
competitor, in this city, with a public price.

| Test | Redcliffe (Jamshedpur) | Dr Lal PathLabs | Other | Golmuri kept |
|---|---|---|---|---|
| Widal | ₹249 (MRP ₹460) | tube ₹320 / slide ₹260 | 1mg ₹229 (MRP ₹400) | **₹315** |
| Urine Routine & Microscopy | ₹145 (MRP ₹376) | — | Healthians ₹199 | ₹225 |
| CBC | ₹295 | — | 1mg ₹299 (MRP ₹350) | ₹325 |
| LDH | ₹299 | ₹160 (Hyderabad) | Metropolis ₹360–650 | **₹300** |
| HBsAg | ₹349 | — | — | **₹200** |
| Haemoglobin | ₹110 | — | LabsAdvisor ₹42–60 | **₹120** |
| ASO titre | — | — | LabsAdvisor ₹300 quant / ₹240 qual (market ₹600) | **₹200** |
| Sickling | — | — | LabsAdvisor ₹120–240; Thyrocare ₹341 | **₹150** |
| Sputum AFB | — | — | AFB stain ₹160 (market ₹460); HOD ₹299 | **₹200** |
| Stool routine | — | — | LabsAdvisor ₹75–150 | ₹100 |

Two findings worth carrying forward:

1. **Redcliffe undercuts the catalogue on the high-volume tests.** CBC ₹295
   against ₹325, Urine Routine ₹145 against ₹225. The ₹225 urine figure came
   from averaging two aggregators that disagreed by 2×; Redcliffe's ₹145 is a
   third reading and the only Jamshedpur-specific one, which argues for coming
   down. Left unchanged for now because it is a repricing question, not a
   duplicate question, and this pass was about the duplicates.
2. **Where a duplicate pair straddled the market, the cheap row was always the
   outlier** — ₹60 Widal against a ₹249–₹320 market, ₹50 Sputum AFB against
   ₹160–₹400, ₹30 Haemoglobin against ₹110. In every case the cheaper row looks
   like a component price or a stale entry rather than a considered rate.

## Gaps

**Now priced** (2026-08-06, both runs): 28 tests — see the full table above.

**Priced but deliberately NOT changed**, with the reason:

| Test | Why left alone |
|---|---|
| HBsAg, HIV 1/2, HCV | The only Jamshedpur listing is the **combined** Viral Marker Screening at ₹1,709 / MRP ₹2,000. The lab charges ₹850 for all three. A single bundled figure 2× the lab's total is not a basis for repricing three individual rapid tests, and no standalone listing exists. |
| Sodium, Chloride | Sold only inside Serum Electrolytes (₹359 / MRP ₹409 for three analytes). Potassium *does* have a standalone page and was repriced from it; deriving the other two from the panel would have contradicted that reading. |
| Dengue IgG/IgM | The catalogue test is IgG/IgM antibody. The Jamshedpur listing found is **NS1 antigen** (₹589 / MRP ₹599) — a different test at a different stage of illness. Not comparable. |
| Semen Examination, Stool Routine | 1mg returns "test not found" for standalone Semen Analysis in Jamshedpur; for stool only Stool **Culture** (₹739) is listed, which is not the routine examination. |

**Still unpriced — no Jamshedpur listing located:** Urine Sugar, Direct/Indirect
Bilirubin, SGOT, Alk-Phosphates, Globulin, A:G Ratio, HDL, LDL, VLDL,
Triglyceride, CPK, CPK-MB, Iron Phosphate, Bicarbonate, Acid Phosphate-Total,
Prs Fact, Copper, Lithium, Phosphorus, ASO, MP Blood Film, MP Card, Sickling
Test, Mantoux, PT/INR, Direct Coombs, Peripheral Blood Smear, Sputum for AFB,
Culture & Sensitivity.

Most of these are analytes the aggregators sell only inside a panel — the same
bundling mismatch noted below, seen from the other side. They keep their
existing prices.

## Sign-off list — the moves to confirm before they bill a patient

Five changes are large enough, or rest on a shaky enough comparison, that they
should not go live on the owner's nod alone:

| Test | Was | Now | The problem |
|---|---|---|---|
| RA Factor | ₹200 | ₹500 | **2.5×.** The listing is *Rheumatoid Factor — Quantitative*, an analyzer method. If this lab runs a latex agglutination card, its cost base is far lower and ₹500 prices it out locally. |
| Amylase | ₹200 | ₹440 | **2.2×.** The catalogue records Amylase in *H.R. Units*, an older method than whatever the aggregator is quoting. |
| CRP | ₹200 | ₹415 | **2.1×.** Same quantitative-vs-card question as RA Factor. |
| Blood Group | ₹50 | ₹135 | **2.7×**, though off a small base, and ₹50 was well under any listed rate. |
| Urine Routine | ₹100 | ₹225 | The two aggregators disagree by more than 2× on this one test (₹314 vs ₹135 midpoints). ₹225 is their mean; neither source alone supports it. |

The general caveat behind three of those five: **an aggregator's price assumes an
analyzer-based method.** Where Golmuri Janch Ghar runs a rapid card instead, the
test is genuinely cheaper to produce and a market-midpoint price overcharges for
it. That is a question about this lab's bench, which no amount of web research
can answer.

**Karexpert** — no per-test public price listing was located for any test.
Karexpert appears to be a hospital-management software vendor rather than a
consumer diagnostics marketplace, so it may not publish comparable retail
prices at all. Worth confirming before treating it as a third data point.

**Bundling mismatch** — the aggregators sell panels (CBC, LFT, KFT) mostly
inside full-body packages rather than standalone, so a like-for-like standalone
comparison may not exist for those. Where it doesn't, MRP on the individual
test page is the only comparable figure.

## Applying these prices (2026-08-06)

### How a price reaches all three apps

Worth stating once, because it is not obvious and it decides where a price has
to be written:

```
desktop SQLite (master)
      │  pushCatalogueToCloud() — upserts the whole catalogue on every boot
      ▼
   Supabase  ──────────►  admin portal   (reads `price` from `tests`)
      │
      └──────────────►  patient portal  (reads `price` from `tests`)
```

So there is exactly **one** place a price has to change — the desktop database —
and **both** portals follow on the next desktop launch.

**A price change is patient-visible.** It is worth being precise about where,
because the two patient-portal pages differ:

- `/tests`, the browse catalogue, shows **no** price — name, category and
  fasting restriction only.
- `/book`, the home-visit booking form, shows **₹ per test and a running
  total** ([BookingForm.tsx](../../apps/portal/src/app/book/BookingForm.tsx),
  total summed in [useBookingState.ts](../../apps/portal/src/app/book/useBookingState.ts)).

That second page is the one that matters here. A patient assembling a home-visit
booking sees these numbers add up before they submit, so every figure in this
survey is a quote given to a patient online — not merely an internal billing
rate. It raises the stakes on the sign-off list above: the five prices flagged
there are quoted to patients the moment the desktop next boots.

### Editing the seed does not reprice a running lab

The new prices are in `seed-golmuri-tests.ts` and `seed-panels.ts`, which is the
version-controlled catalogue — but **a machine that is already running will not
pick them up**, and it is worth being explicit about why:

- `seedOne()` does `findFirst({ where: { name } })` and then
  `existing ?? create(...)`. An existing test is returned untouched; its price is
  never written. ([seed-golmuri-tests.ts](../../apps/desktop/src/main/services/seed-golmuri-tests.ts))
- `catalogue-reconciliation.service.ts` only ever deactivates superseded legacy
  tests. It does not update price either.
- Boot seeding is additionally gated on a count guard (`GOLMURI_SEED_COUNT` +
  `SPECIAL_SEED_COUNT`), so on the lab PC the seed is skipped wholesale.

So the seed files take effect on a **fresh install only**. The running lab is
repriced instead by
`packages/db/prisma/migrations/20260806210000_reprice_catalogue_market_survey/`,
which applies the 28 changes directly to the existing rows on the next desktop
launch, and from there to Supabase and the staff portal.

**Every UPDATE in that migration is guarded on the old price.** If the owner has
already retyped a price under Tests → edit, that row is left exactly as they set
it — the migration only moves rows still sitting at the pre-survey figure. It is
therefore safe to re-run, and it cannot silently overwrite a deliberate local
decision.

To reverse any single change, the old value is in the "Was" column of the table
above; retyping it under Tests → edit is enough, and the guard means the
migration will not put it back.

**The one way this migration can quietly do nothing.** It matches on exact test
name, and a name that does not match is skipped without error. Two generations
of names exist in this project's history: the original 13-test seed in
`packages/db/src/seed.ts` used `Blood Sugar Fasting`, `Urine Routine` and
`Complete Blood Count (CBC)`, while the catalogue now in use — from
`seed-golmuri-tests.ts` — calls those `Blood Glucose Fasting`,
`Urine Routine Examination` and `CBC / Blood Examination`. The migration targets
the **current** names, since `catalogue-reconciliation.service.ts` deactivates
the legacy generation rather than billing against it.

Dry-running the migration against `packages/db/prisma/dev.sqlite` changes only
4 of 28 rows for exactly this reason — that file still holds the old 13-test
seed. That is the expected result there, not a fault, but it is also the reason
the run on the real machine has to be **checked rather than assumed**: open
Tests after the next launch and confirm CBC reads ₹325. If the prices have not
moved, the live catalogue is using names this migration does not know, and the
name list needs reconciling before anything else.

### The discount feature — verified present and correct

Checked because catalogue prices are now set at market rather than at the
customary walk-in rate, which makes the discount path load-bearing:

- **It exists and works.** `invoices:applyDiscount` takes `{ invoiceId, amount,
  isPercent }`. Flat: `discount = amount`. Percentage:
  `Math.round(subtotal * amount) / 100`, which is the round-to-two-decimals
  idiom and computes correctly — 10 on a ₹1,000 subtotal yields ₹100.
  ([invoices.ipc.ts:72](../../apps/desktop/src/main/ipc/invoices.ipc.ts))
- **It is bounded.** `discount < 0 || discount > subtotal` throws
  `INVALID_INPUT`, so an over-100% percentage is rejected by the same guard that
  catches an over-large flat amount. A bill cannot go negative.
- **It is Admin-only and audited** — `requireAdmin()` on the handler, the UI
  section gated on `user?.role === "Admin"`, and an `APPLY_DISCOUNT` audit row
  per application.
- **Unchanged limitation:** it applies to the whole invoice subtotal, not to a
  single test line, and only after the invoice exists.

The July concern therefore stands and now bites harder: with catalogue prices at
market, **a walk-in paying the customary lower rate needs an Admin present at
billing**, because a receptionist cannot reduce a bill. Either widen the role
check or accept that discounting is an owner-only action.
