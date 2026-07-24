-- Allow authenticated users (Admin/Staff) to read catalog tables
-- These tables were previously only explicitly granted SELECT to 'anon'.
-- Since 'admin' uses the 'authenticated' role, it needs policies to read them.

CREATE POLICY admin_read_tests ON tests
  FOR SELECT TO authenticated
  USING (jwt_role() IN ('Admin', 'Staff'));

CREATE POLICY admin_read_doctors ON doctors
  FOR SELECT TO authenticated
  USING (jwt_role() IN ('Admin', 'Staff'));

CREATE POLICY admin_read_parameters ON parameters
  FOR SELECT TO authenticated
  USING (jwt_role() IN ('Admin', 'Staff'));

CREATE POLICY admin_read_lab_settings ON lab_settings
  FOR SELECT TO authenticated
  USING (jwt_role() IN ('Admin', 'Staff'));
