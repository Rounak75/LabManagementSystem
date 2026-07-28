-- Allow authenticated users (Admin/Staff) to read catalog tables.
--
-- These tables previously granted SELECT only to 'anon'. The admin portal signs
-- in with a staff JWT and therefore queries as 'authenticated', so without these
-- policies the test catalogue, doctor list and lab details came back empty with
-- no error — RLS filtering every row away looks exactly like having no data.
--
-- Every CREATE is preceded by a DROP IF EXISTS. `CREATE POLICY` has no
-- `IF NOT EXISTS` form, so re-running this where any of the four already exists
-- fails the entire migration:
--
--   ERROR: policy "admin_read_tests" for table "tests" already exists
--   (SQLSTATE 42710)
--
-- and since migrations apply in order, that one policy blocks every migration
-- queued behind it. Idempotence here is not tidiness; it is the difference
-- between a queue that can be re-run and one that wedges on a half-applied
-- database.

DROP POLICY IF EXISTS admin_read_tests ON tests;
CREATE POLICY admin_read_tests ON tests
  FOR SELECT TO authenticated
  USING (jwt_role() IN ('Admin', 'Staff'));

DROP POLICY IF EXISTS admin_read_doctors ON doctors;
CREATE POLICY admin_read_doctors ON doctors
  FOR SELECT TO authenticated
  USING (jwt_role() IN ('Admin', 'Staff'));

DROP POLICY IF EXISTS admin_read_parameters ON parameters;
CREATE POLICY admin_read_parameters ON parameters
  FOR SELECT TO authenticated
  USING (jwt_role() IN ('Admin', 'Staff'));

DROP POLICY IF EXISTS admin_read_lab_settings ON lab_settings;
CREATE POLICY admin_read_lab_settings ON lab_settings
  FOR SELECT TO authenticated
  USING (jwt_role() IN ('Admin', 'Staff'));
