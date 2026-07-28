# Jamshedpur diagnostic test pricing — market survey

**Researched:** 2026-07-28 · **City:** Jamshedpur, Jharkhand · **Status:** PARTIAL

Gathered to reprice the Golmuri Janch Ghar catalogue. Every price below was read
off the live listing page cited beneath it — nothing here is estimated or
interpolated. Tests not listed were not reached before the research run was cut
short; see [Gaps](#gaps).

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

| Test | 1mg (₹) | Apollo (₹) | Karexpert (₹) | MRP (₹) | Current (₹) |
|---|---|---|---|---|---|
| Blood Glucose Fasting | not found | 79 | not found | 197 | 100 |
| PP Glucose (PPBS) | 79 | not found | not found | 160 | 100 |
| Random Glucose (RBS) | 79 | not found | not found | 159 | 100 |
| Urine Routine (CUE) | not found | 179 | not found | 448 | 100 |
| Thyroid Profile (T3/T4/TSH) | 299 | not found | not found | 550 | 500 |
| TSH Ultrasensitive | 319 | not found | not found | 332 | — (not in catalogue) |

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

## Gaps

**Not yet priced** — the research run was cut short by a session limit before
reaching these. All are still outstanding:

CBC, Lipid Profile, LFT, KFT/Renal Profile, ESR, Urea, Creatinine, Uric Acid,
bilirubins, SGPT, SGOT, Alkaline Phosphatase, Total Protein, Albumin,
Cholesterol, HDL, LDL, VLDL, Triglycerides, Calcium, Sodium, Potassium,
Chloride, Phosphorus, Amylase, LDH, CPK, CPK-MB, Peripheral Blood Smear,
Blood Group, PT/INR, CRP, RA Factor, ASO, VDRL, HBsAg, HIV 1/2, HCV, Widal,
Dengue IgG/IgM, Dengue NS1, MP Card, Sickling Test, Mantoux, Direct Coombs,
Urine Culture & Sensitivity, Stool Routine, Semen Analysis, Sputum for AFB.

**Karexpert** — no per-test public price listing was located for any test.
Karexpert appears to be a hospital-management software vendor rather than a
consumer diagnostics marketplace, so it may not publish comparable retail
prices at all. Worth confirming before treating it as a third data point.

**Bundling mismatch** — the aggregators sell panels (CBC, LFT, KFT) mostly
inside full-body packages rather than standalone, so a like-for-like standalone
comparison may not exist for those. Where it doesn't, MRP on the individual
test page is the only comparable figure.
