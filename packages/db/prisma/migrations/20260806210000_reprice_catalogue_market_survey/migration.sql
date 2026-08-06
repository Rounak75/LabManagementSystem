-- Reprice the catalogue against the Jamshedpur market survey (2026-08-06).
--
-- Why this is a migration and not a seed edit: seedOne() in
-- seed-golmuri-tests.ts does `existing ?? create(...)`, so it never rewrites the
-- price of a test that is already there, and catalogue-reconciliation.service.ts
-- only deactivates superseded rows. The seed files govern a *fresh install*.
-- The lab PC already holds its catalogue, so without this file the new prices
-- would never reach it — nor, therefore, the admin portal, which reads price
-- from Supabase and is fed by pushCatalogueToCloud() on every desktop boot.
-- The patient portal lists tests without prices, so it needs nothing.
--
-- Every figure is the midpoint of an aggregator's booking rate and its MRP, both
-- read off the live Jamshedpur listing cited in
-- docs/research/jamshedpur-lab-test-pricing.md on 2026-08-06.
--
-- EACH UPDATE IS GUARDED ON THE OLD PRICE. If the owner has already retyped a
-- price under Tests → edit, that row is left exactly as they set it. This runs
-- once, changes only untouched rows, and is safe to re-run.
--
-- Comparison is on CAST(price AS REAL) with a tolerance because `price` is a
-- Prisma Decimal, which SQLite stores with NUMERIC affinity — a bare `= 100`
-- is not reliably true for a value written as 100.0.

-- ─── Biochemistry ──────────────────────────────────────────────────────────
-- aggregator ₹79 / MRP ₹197
UPDATE "Test" SET "price" = 140 WHERE "name" = 'Blood Glucose Fasting' AND ABS(CAST("price" AS REAL) - 100) < 0.01;
-- aggregator ₹79 / MRP ₹160
UPDATE "Test" SET "price" = 120 WHERE "name" = 'PP Glucose'            AND ABS(CAST("price" AS REAL) - 100) < 0.01;
-- aggregator ₹79 / MRP ₹159
UPDATE "Test" SET "price" = 120 WHERE "name" = 'Random Glucose'        AND ABS(CAST("price" AS REAL) - 100) < 0.01;
-- aggregator ₹119 / MRP ₹140 — a price CUT
UPDATE "Test" SET "price" = 130 WHERE "name" = 'Urea'                  AND ABS(CAST("price" AS REAL) - 150) < 0.01;
-- aggregator ₹149 / MRP ₹209
UPDATE "Test" SET "price" = 180 WHERE "name" = 'Creatinine'            AND ABS(CAST("price" AS REAL) - 150) < 0.01;
-- aggregator ₹129 / MRP ₹139
UPDATE "Test" SET "price" = 135 WHERE "name" = 'Total Bilirubin'       AND ABS(CAST("price" AS REAL) - 100) < 0.01;
-- aggregator ₹189 / MRP ₹200
UPDATE "Test" SET "price" = 195 WHERE "name" = 'SGPT (ALT)'            AND ABS(CAST("price" AS REAL) - 150) < 0.01;
-- aggregator ₹139 / MRP ₹199
UPDATE "Test" SET "price" = 170 WHERE "name" = 'Total Protein'         AND ABS(CAST("price" AS REAL) - 100) < 0.01;
-- aggregator ₹129 / MRP ₹130
UPDATE "Test" SET "price" = 130 WHERE "name" = 'Albumin'               AND ABS(CAST("price" AS REAL) - 100) < 0.01;
-- aggregator ₹139 / MRP ₹150 — a price CUT
UPDATE "Test" SET "price" = 145 WHERE "name" = 'Total Cholesterol'     AND ABS(CAST("price" AS REAL) - 150) < 0.01;
-- aggregator ₹139 / MRP ₹199
UPDATE "Test" SET "price" = 170 WHERE "name" = 'Uric Acid'             AND ABS(CAST("price" AS REAL) - 150) < 0.01;
-- aggregator ₹159 / MRP ₹219
UPDATE "Test" SET "price" = 190 WHERE "name" = 'Calcium'               AND ABS(CAST("price" AS REAL) - 150) < 0.01;
-- aggregator ₹179 / MRP ₹199
UPDATE "Test" SET "price" = 190 WHERE "name" = 'Potassium'             AND ABS(CAST("price" AS REAL) - 150) < 0.01;
-- aggregator ₹319 / MRP ₹400 — large move, see the sign-off list in the survey
UPDATE "Test" SET "price" = 360 WHERE "name" = 'LDH'                   AND ABS(CAST("price" AS REAL) - 200) < 0.01;
-- aggregator ₹399 / MRP ₹485 — large move, see the sign-off list in the survey
UPDATE "Test" SET "price" = 440 WHERE "name" = 'Amylase'               AND ABS(CAST("price" AS REAL) - 200) < 0.01;

-- ─── Haematology, urine ────────────────────────────────────────────────────
-- aggregator ₹299 / MRP ₹350 — a price CUT; CBC was above even the MRP
UPDATE "Test" SET "price" = 325 WHERE "name" = 'CBC / Blood Examination'    AND ABS(CAST("price" AS REAL) - 400) < 0.01;
-- Two aggregators disagree sharply here: Apollo CUE ₹179/₹448 (midpoint ₹314)
-- against 1mg Urine R/M ₹89/₹180 (midpoint ₹135). ₹225 is the mean of the two
-- midpoints rather than either alone.
UPDATE "Test" SET "price" = 225 WHERE "name" = 'Urine Routine Examination'  AND ABS(CAST("price" AS REAL) - 100) < 0.01;

-- ─── Serology and rapid tests ──────────────────────────────────────────────
-- aggregator ₹119 / MRP ₹149 — a price CUT
UPDATE "Test" SET "price" = 135 WHERE "name" = 'VDRL'        AND ABS(CAST("price" AS REAL) - 150) < 0.01;
-- aggregator ₹119 / MRP ₹150 — large move, see the sign-off list
UPDATE "Test" SET "price" = 135 WHERE "name" = 'Blood Group' AND ABS(CAST("price" AS REAL) - 50)  < 0.01;
-- aggregator ₹229 / MRP ₹400
UPDATE "Test" SET "price" = 315 WHERE "name" = 'Widal Test'  AND ABS(CAST("price" AS REAL) - 200) < 0.01;
-- aggregator ₹379 / MRP ₹449 — large move, and a method mismatch: see sign-off
UPDATE "Test" SET "price" = 415 WHERE "name" = 'CRP'         AND ABS(CAST("price" AS REAL) - 200) < 0.01;
-- aggregator ₹499 / MRP ₹500 — largest move in the catalogue; method mismatch
UPDATE "Test" SET "price" = 500 WHERE "name" = 'RA Factor'   AND ABS(CAST("price" AS REAL) - 200) < 0.01;

-- ─── Panels ────────────────────────────────────────────────────────────────
-- aggregator ₹359 / MRP ₹400 — a cut of ₹220, the widest gap in the catalogue
UPDATE "Test" SET "price" = 380 WHERE "name" = 'Lipid Profile'                AND ABS(CAST("price" AS REAL) - 600) < 0.01;
-- aggregator ₹399 / MRP ₹710 — a price CUT
UPDATE "Test" SET "price" = 550 WHERE "name" = 'Liver Function Test (LFT)'    AND ABS(CAST("price" AS REAL) - 700) < 0.01;
-- DERIVED, not read off a page: no standalone Jamshedpur KFT listing exists.
UPDATE "Test" SET "price" = 550 WHERE "name" = 'Kidney Function Test (KFT)'   AND ABS(CAST("price" AS REAL) - 700) < 0.01;
-- aggregator ₹299 / MRP ₹550 — a price CUT; outsourced, so check the partner rate
UPDATE "Test" SET "price" = 425 WHERE "name" = 'Thyroid Profile (T3/T4/TSH)'  AND ABS(CAST("price" AS REAL) - 500) < 0.01;
-- aggregator ₹109 / MRP ₹149
UPDATE "Test" SET "price" = 130 WHERE "name" = 'ESR'                          AND ABS(CAST("price" AS REAL) - 100) < 0.01;
