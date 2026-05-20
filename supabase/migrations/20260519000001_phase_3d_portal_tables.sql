-- Phase 3d Plan A — mirror new Prisma tables in Supabase.
-- Snake-case mirrors of PatientAccount, Booking, PaymentClaim, Dispute, CloudHeartbeat.
-- Also: drop the unique constraint on patients.phone (household sharing),
-- and add the new columns on visits / users / lab_settings.

create table if not exists patient_accounts (
  id              text primary key,
  patient_id      text not null unique references patients(id),
  password_hash   text,
  last_login_at   timestamptz,
  failed_attempts int  not null default 0,
  locked_until    timestamptz,
  version         int  not null default 0,
  created_at      timestamptz not null,
  updated_at      timestamptz not null
);
create index if not exists patient_accounts_patient_id_idx on patient_accounts(patient_id);

create table if not exists bookings (
  id                    text primary key,
  booking_id            text not null unique,
  patient_phone         text not null,
  patient_name          text not null,
  patient_email         text,
  address               text not null,
  pincode               text,
  test_ids              text not null,
  preferred_date        timestamptz not null,
  preferred_slot        text not null,
  notes                 text,
  status                text not null default 'Pending',
  decline_reason        text,
  approved_by_user_id   text,
  approved_at           timestamptz,
  assigned_to_user_id   text,
  resulting_visit_id    text,
  resulting_patient_id  text,
  version               int  not null default 0,
  source_ip             text,
  captcha_passed        boolean not null default false,
  created_at            timestamptz not null,
  updated_at            timestamptz not null
);
create index if not exists bookings_status_date_idx on bookings(status, preferred_date);
create index if not exists bookings_phone_idx       on bookings(patient_phone);
create index if not exists bookings_created_idx     on bookings(created_at);

create table if not exists payment_claims (
  id          text primary key,
  invoice_id  text not null,
  claimed_at  timestamptz not null,
  source_ip   text,
  expires_at  timestamptz not null
);
create index if not exists payment_claims_invoice_expires_idx on payment_claims(invoice_id, expires_at);

create table if not exists disputes (
  id                   text primary key,
  patient_id           text not null,
  reason               text not null default 'phone_recycled',
  status               text not null default 'Open',
  created_at           timestamptz not null,
  resolved_at          timestamptz,
  resolved_by_user_id  text,
  resolution_note      text
);
create index if not exists disputes_status_created_idx on disputes(status, created_at);
create index if not exists disputes_patient_idx        on disputes(patient_id);

create table if not exists cloud_heartbeat (
  id              text primary key,
  last_pushed_at  timestamptz not null
);

-- Extend existing tables for the column additions.
-- Note: User model is NOT synced to cloud (staff/admin accounts are local-only on
-- the desktop), so there's no cloud `users` table to alter. The `canCollectSamples`
-- flag is purely a desktop concern that gates phlebotomist choices in the
-- bookings approval UI.
alter table visits       add column if not exists access_code_hash text;
alter table lab_settings add column if not exists preferred_payment_gateway text not null default 'UPI';
alter table lab_settings add column if not exists portal_url text;

-- Drop the unique constraint on patients.phone if present (household sharing).
-- Constraint name follows Postgres default for `phone text unique`.
alter table patients drop constraint if exists patients_phone_key;
