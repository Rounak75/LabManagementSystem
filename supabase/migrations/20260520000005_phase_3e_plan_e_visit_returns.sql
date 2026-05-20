-- Phase 3e Plan E: "send back to staff" metadata. Admin-portal-only columns —
-- like the PendingVerify/Verified/ReturnedForReview status values, these live in
-- cloud and are interpreted by the desktop pull layer; the desktop Prisma Visit
-- model is unchanged for now (no local query selects them).
alter table visits
  add column if not exists return_reason text,
  add column if not exists return_note   text;
