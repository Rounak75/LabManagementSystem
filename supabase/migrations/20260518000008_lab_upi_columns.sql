ALTER TABLE lab_settings
  ADD COLUMN IF NOT EXISTS lab_upi_vpa TEXT,
  ADD COLUMN IF NOT EXISTS lab_upi_payee_name TEXT;
