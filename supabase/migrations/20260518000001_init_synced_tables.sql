-- Synced patient-facing tables (snake_case mirrors of Prisma models)

CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  sex TEXT,
  age INT,
  address TEXT,
  referred_by_id TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE doctors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  qualifications TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE tests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  result_type TEXT,
  price NUMERIC,
  is_outsourced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE parameters (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  ref_range_male_min NUMERIC,
  ref_range_male_max NUMERIC,
  ref_range_female_min NUMERIC,
  ref_range_female_max NUMERIC,
  ref_range_child_min NUMERIC,
  ref_range_child_max NUMERIC,
  qualitative_options TEXT,
  normal_qualitative TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  visit_id TEXT,
  referred_by_id TEXT,
  status TEXT,
  visit_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX visits_patient_id_idx ON visits (patient_id);

CREATE TABLE visit_tests (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL,
  test_id TEXT NOT NULL,
  status TEXT,
  outsourced_sent_to TEXT,
  outsourced_external_ref TEXT,
  outsourced_sent_at TIMESTAMPTZ,
  outsourced_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX visit_tests_visit_id_idx ON visit_tests (visit_id);

CREATE TABLE results (
  id TEXT PRIMARY KEY,
  visit_test_id TEXT NOT NULL,
  parameter_id TEXT NOT NULL,
  value TEXT,
  is_abnormal BOOLEAN,
  is_abnormal_override BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX results_visit_test_id_idx ON results (visit_test_id);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL UNIQUE,
  subtotal NUMERIC NOT NULL,
  discount_amount NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'Pending',
  amount_paid NUMERIC DEFAULT 0,
  razorpay_order_id TEXT,
  razorpay_payment_link_id TEXT,
  razorpay_payment_link_short_url TEXT,
  razorpay_qr_id TEXT,
  razorpay_qr_image_url TEXT,
  payment_link_expires_at TIMESTAMPTZ,
  payment_link_status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  method TEXT,
  provider_payment_id TEXT,
  created_at TIMESTAMPTZ
);

CREATE INDEX payments_invoice_id_idx ON payments (invoice_id);

CREATE TABLE lab_settings (
  id TEXT PRIMARY KEY,
  lab_name TEXT NOT NULL,
  lab_address TEXT,
  lab_phone TEXT,
  lab_email TEXT,
  morning_open_time TEXT,
  morning_close_time TEXT,
  evening_open_time TEXT,
  evening_close_time TEXT,
  child_age_boundary INT,
  pathologist_name TEXT,
  pathologist_quals TEXT,
  updated_at TIMESTAMPTZ
);

CREATE TABLE home_visits (
  id TEXT PRIMARY KEY,
  patient_id TEXT,
  booker_name TEXT NOT NULL,
  booker_phone TEXT NOT NULL,
  address TEXT NOT NULL,
  preferred_date TIMESTAMPTZ,
  preferred_time TEXT,
  tests_requested TEXT,
  assigned_to_id TEXT,
  status TEXT DEFAULT 'Booked',
  visit_id TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
