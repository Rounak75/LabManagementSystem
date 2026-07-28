-- The Admin's per-visit decision to hand an unpaid report to the patient anyway.
--
-- The portal withholds a verified report while the bill is unpaid. That is right
-- for a walk-in and wrong for a regular the lab has always extended credit to, or
-- a patient who paid in a way the system has not caught up with. Without a release
-- valve the only options would be to record a payment that never happened — which
-- corrupts the day's takings — or to tell the patient their report does not exist.
--
-- Printing on this machine is never gated; this only governs the portal download.

ALTER TABLE "Visit" ADD COLUMN "reportReleaseOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Visit" ADD COLUMN "reportReleaseOverrideByUserId" TEXT;
ALTER TABLE "Visit" ADD COLUMN "reportReleaseOverrideAt" DATETIME;
ALTER TABLE "Visit" ADD COLUMN "reportReleaseOverrideReason" TEXT;
