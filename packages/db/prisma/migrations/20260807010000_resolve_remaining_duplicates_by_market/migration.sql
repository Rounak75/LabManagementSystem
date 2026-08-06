-- Resolve the last eight duplicated test names against competitor pricing.
--
-- The earlier migrations settled the cases that needed no judgement (identical
-- twins, a ₹0 price, a row with no parameters). These eight were deliberately
-- left alone because choosing between them needed a market rate that the
-- Jamshedpur aggregator listings did not carry. Those rates have now been read
-- from the competitors themselves and are cited per test below.
--
-- Sources, all read 2026-08-07 and recorded in
-- docs/research/jamshedpur-lab-test-pricing.md:
--   Redcliffe Labs publishes Jamshedpur-specific prices  (redcliffelabs.com/jamshedpur/…)
--   Dr Lal PathLabs has a Jamshedpur branch              (lalpathlabs.com)
--   LabsAdvisor aggregates national booking vs market rates
--   Metropolis / Thyrocare for the tests the others omit
--
-- Same rules as before: DEACTIVATE, never delete, so an invoice already raised
-- against a retired row still prints what it was billed at. Re-verified before
-- writing: every row retired here has been booked zero times.

-- ─── Widal Test ────────────────────────────────────────────────────────────
-- Competitors: Redcliffe Jamshedpur ₹249 (MRP ₹460), Dr Lal tube agglutination
-- ₹320 / slide ₹260, 1mg ₹229 (MRP ₹400). ₹60 is far below every one of them.
--
-- But the ₹60 row is the one carrying the full four-titre parameter set (TO/TH/
-- AO/AH); the ₹315 row has only two. Retiring the cheap row would have thrown
-- away the better test to keep the better price. So the survivor is the
-- four-parameter row, repriced to the market figure, and the two-parameter row
-- is the one retired. Price and clinical completeness both kept.
UPDATE "Test" SET "price" = 315
 WHERE "id" = 'e3483f9c-f2b7-4b9a-813b-b6a4dee654f9' AND "isActive" = 1;
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = 'e6cd0de6-8756-4c2b-b885-436fec2a1206' AND "isActive" = 1;

-- ─── LDH ───────────────────────────────────────────────────────────────────
-- Competitors: Redcliffe ₹299, 1mg ₹319 (MRP ₹400), Metropolis ₹360-650,
-- Dr Lal ₹160. The ₹300 row matches Redcliffe almost exactly AND is the one
-- filed under Clinical Biochemistry; the ₹360 row is misfiled under Hematology.
-- Price and category agree here, which makes it the easiest of the eight.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = '5137e720-988b-4600-bda3-94ce5121d67e' AND "isActive" = 1;

-- ─── A.S.O.Test ────────────────────────────────────────────────────────────
-- Competitors: LabsAdvisor ₹300 quantitative / ₹240 qualitative, against a
-- stated market rate of ₹600. This lab's ASO reports a numeric IU/ml, so it is
-- the quantitative form. Both local rows sit under every competitor figure;
-- ₹200 is the nearer. Left at ₹200 rather than lifted to ₹300 — the only rates
-- found are national, not Jamshedpur, which is a weaker basis than the
-- city-specific readings used elsewhere in this file.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = 'da9851f9-5818-425f-b71f-271915b7a2db' AND "isActive" = 1;

-- ─── Hbs Ag ────────────────────────────────────────────────────────────────
-- Competitor: Redcliffe ₹349. Both local rows are well under it; ₹200 is nearer.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = 'af4a6ec5-5964-4236-ae45-4c6300ea03b6' AND "isActive" = 1;

-- ─── Sickling Test ─────────────────────────────────────────────────────────
-- Competitors: LabsAdvisor ₹120-240 across cities (Delhi ₹120 against a ₹300
-- market), Thyrocare ₹341. ₹150 sits inside that band; ₹80 is below all of it.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = '0d74bd26-a845-44bd-afcb-aa44632f6e76' AND "isActive" = 1;

-- ─── Sputum for AFB ────────────────────────────────────────────────────────
-- Competitors: AFB stain ₹160 (market ₹460), HOD ₹299, Delhi from ₹400.
-- ₹50 is not a sustainable price for a stained microscopy anywhere.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = '1ca52dda-19bc-4b1f-a7df-63dcd7a32adc' AND "isActive" = 1;

-- ─── Haemoglobin ───────────────────────────────────────────────────────────
-- Competitors: Redcliffe Hb ₹110, LabsAdvisor ₹42-60 national. ₹120 is within a
-- rupee or two of Redcliffe; ₹30 is below even the cheapest aggregator rate and
-- is almost certainly the in-CBC component price rather than a standalone test.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = 'bba2a992-40bc-44da-ac6a-023fd53e05b0' AND "isActive" = 1;

-- ─── Routine Test ×3 — all three retired ───────────────────────────────────
-- ₹100 / ₹40 / ₹30, and ALL THREE carry zero parameters, so not one of them can
-- hold a result: booking any of them produces a visit that can never be
-- completed. They are legacy rows for work the catalogue already does properly
-- under a name that says which sample it is —
--     Urine Routine Examination  ₹225  (21 parameters)
--     Stool Routine Examination  ₹100  (16 parameters)
--     Semen Examination          ₹300  (fully parameterised)
-- — all three of which were confirmed present and active before this was
-- written. Nothing is lost by retiring the unusable rows, and "Routine Test"
-- tells a patient nothing about which sample to bring.
UPDATE "Test" SET "isActive" = 0
 WHERE "id" IN (
   'ee37d475-95ce-4842-af12-366dffabb9dc',
   '9cb68317-631a-4035-bb81-4da8dd35f781',
   '68eefe2e-2b21-40c8-9c64-de1b32c578fc'
 ) AND "isActive" = 1;

-- ─── Noted, not fixed here ─────────────────────────────────────────────────
-- "Urine culture" is priced at ₹0 and would bill nothing. It is not a duplicate,
-- so it is out of scope for this migration, but it needs a price before it is
-- booked. Competitor reference: Redcliffe sells urine culture in Jamshedpur;
-- the catalogue also carries "Culture & Sensitivity Test" at ₹500, which may be
-- the same work under a second name.
