-- The outcome of the staff confirmation call, recorded at approval.
--
-- Nothing on the portal proves the phone number a patient typed is theirs, and
-- approving a booking writes that number onto a real Patient — where it becomes
-- the portal login. A single wrong digit locks the real patient out for good and
-- hands their record to whoever owns the number that was typed.
--
-- Staff already ring every booking before approving it. This stores what the
-- call found, so a number nobody could reach is a recorded decision instead of
-- an assumption.

ALTER TABLE "Booking" ADD COLUMN "phoneConfirmOutcome" TEXT;
ALTER TABLE "Booking" ADD COLUMN "phoneConfirmedAt" DATETIME;
ALTER TABLE "Booking" ADD COLUMN "phoneConfirmedById" TEXT;
