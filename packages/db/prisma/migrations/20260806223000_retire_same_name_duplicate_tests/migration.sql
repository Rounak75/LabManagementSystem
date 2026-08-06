-- Retire same-name duplicate tests, and rename the ones that only look like
-- duplicates.
--
-- The catalogue held 209 active tests under 193 distinct names. The patient
-- booking form lists every active test, so fourteen of them printed twice (three
-- times, for two of them) at different prices, and a patient could pick either.
--
-- Nothing prevented this: `Test.name` has no unique constraint, and
-- `tests:create` never checked. `catalogue-reconciliation.service.ts` does retire
-- duplicates, but only a hardcoded list of legacy names that DIFFER from their
-- canonical twin, so a same-name pair was invisible to it. The create/update
-- guard added alongside this migration stops new ones appearing.
--
-- NOTHING IS DELETED. Rows are deactivated, exactly as
-- catalogue-reconciliation.service.ts does, so an invoice already raised against
-- one still prints the name and price it was billed at. Verified before writing
-- this: every duplicate row below has been booked ZERO times (`visit_tests` holds
-- 17 rows in total, none against any of these ids), so no billing history is
-- touched at all.
--
-- Survivors are chosen on evidence, in this order:
--   1. a row with parameters beats a row with none — a test with zero parameters
--      renders no input and can never have a result entered;
--   2. then the price closest to the Jamshedpur market midpoint in
--      docs/research/jamshedpur-lab-test-pricing.md;
--   3. for a pair identical on both, the lower id, so the choice is deterministic.
--
-- Only the unambiguous cases are here. Seven names still need the owner's
-- decision and are listed at the bottom — deliberately left alone rather than
-- guessed at.

-- ─── 1. Survivor has parameters, loser has none ────────────────────────────
-- Lipid Profile ₹400 carries 0 parameters: it cannot hold a result. The ₹380 row
-- has all 6 and is also the market midpoint. Not a close call.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = '87648938-baab-433c-becf-ae5622231a1d' AND "isActive" = 1;

-- ─── 2. One row carries a broken price ─────────────────────────────────────
-- Diff.WBC Count at ₹0 would bill nothing. Both rows have the same 5 parameters.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = 'e54471dd-c8cb-4bfb-9098-5af8c3ca0d7c' AND "isActive" = 1;

-- ─── 3. Identical twins — same price, same parameter count ─────────────────
-- Nothing distinguishes these; one of each pair simply has to go.
-- Mountox (10 TU): both ₹60, both 1 parameter.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = 'a9daeb20-f049-41b8-9cb1-936dbf169969' AND "isActive" = 1;
-- C.Reactive Proteins Test: both ₹200, both 1 parameter.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = 'cd986bd8-390e-4673-928b-d564815c79fb' AND "isActive" = 1;

-- ─── 4. Market decides ─────────────────────────────────────────────────────
-- Total Cholesterol: aggregator ₹139 / MRP ₹150 → midpoint ₹145. The ₹60 row is
-- less than half the booking rate anywhere.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = '15066da1-bf4c-4c4e-b58f-32f4a99d8e43' AND "isActive" = 1;

-- ─── 5. Not duplicates at all — renamed to say what they are ───────────────
-- "Albumin" ₹130 and "Albumin" ₹20 are two different tests sharing one name.
-- ₹20 cannot be a serum albumin at any Jamshedpur rate (the standalone listing
-- is ₹129 / MRP ₹130); at that price it is the urine dipstick. Renaming keeps
-- both tests, which deactivating one would not.
--
-- CHECK THIS ONE AT THE BENCH before trusting it — it is an inference from price,
-- not something the catalogue records. If ₹20 is not urine albumin, rename it to
-- whatever it is; the point is that two tests must not share one name.
UPDATE "Test" SET "name" = 'Urine Albumin'
 WHERE "id" = '0113cd87-d19f-4b7c-a953-3ef57b0428c5' AND "name" = 'Albumin';

-- ─── Deliberately NOT touched — these need the owner ───────────────────────
-- Left active and still duplicated, because guessing would be worse than waiting:
--
--   Routine Test   ₹100 / ₹40 / ₹30 — all three have ZERO parameters, so none can
--                  hold a result today. Almost certainly urine / stool / semen
--                  routine, but which is which is not recorded anywhere.
--   Widal Test     ₹315 (2 params) / ₹60 / ₹60 (4 params each). Market midpoint is
--                  ₹315, but the ₹60 rows carry the fuller four-titre parameter
--                  set. Price rule and clinical completeness disagree.
--   LDH            ₹360 (category Hematology) / ₹300 (category Clinical
--                  Biochemistry). Market says ₹360; the category on that row is
--                  wrong, and the correctly-filed row is the cheaper one.
--   A.S.O.Test     ₹200 / ₹150 — no Jamshedpur listing found, so no market anchor.
--   Hbs Ag         ₹200 / ₹150 — sold only inside a bundled viral-marker panel.
--   Sickling Test  ₹150 / ₹80  — no listing found.
--   Sputum for AFB ₹200 / ₹50  — no listing found.
--   Haemoglobin    ₹120 / ₹30  — ₹30 is likely the in-CBC component rather than a
--                  standalone test.
