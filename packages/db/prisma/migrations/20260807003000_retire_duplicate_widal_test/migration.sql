-- Retire the second identical "Widal Test ₹60".
--
-- Missed by 20260806223000_retire_same_name_duplicate_tests, which treated Widal
-- as a three-row case needing the owner's judgement and so left all three alone.
-- That was half right. Two of the three rows are identical twins — same ₹60,
-- same four parameters, both booked zero times — and there is nothing to decide
-- between them. Only the ₹315-versus-₹60 question is a real judgement call, and
-- that one is still deliberately untouched.
--
-- Spotted from the staff portal, which showed two Widal Tests at ₹60 side by
-- side after the earlier migration was written.
--
-- Same rules as the previous migration: deactivate, never delete, so an invoice
-- raised against this row still prints what it was billed as. Where a pair is
-- identical on every other measure the lower id survives, so the choice is
-- deterministic rather than arbitrary:
--   keep    e3483f9c-f2b7-4b9a-813b-b6a4dee654f9  ₹60, 4 params
--   retire  9aacf06c-3ad2-40fa-bdc0-063d95ed0324  ₹60, 4 params
UPDATE "Test" SET "isActive" = 0
 WHERE "id" = '9aacf06c-3ad2-40fa-bdc0-063d95ed0324' AND "isActive" = 1;

-- Still open, and still the owner's call: "Widal Test" ₹315 (2 parameters, the
-- market midpoint) against the surviving "Widal Test" ₹60 (4 parameters, the
-- fuller four-titre set). Price and clinical completeness point at different
-- rows, which is exactly why this is not decided here.
