-- Fix RLS performance by wrapping current_setting in SELECT or using a function
-- This prevents postgres from evaluating the JSON path per-row.

CREATE OR REPLACE FUNCTION get_jwt_patient_id() RETURNS text AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'patient_id';
$$ LANGUAGE sql STABLE;

DROP POLICY IF EXISTS patient_own_record ON patients;
CREATE POLICY patient_own_record ON patients
  FOR SELECT TO anon
  USING (id = (SELECT get_jwt_patient_id()));

DROP POLICY IF EXISTS visits_own ON visits;
CREATE POLICY visits_own ON visits
  FOR SELECT TO anon
  USING (patient_id = (SELECT get_jwt_patient_id()));

DROP POLICY IF EXISTS visit_tests_own ON visit_tests;
CREATE POLICY visit_tests_own ON visit_tests
  FOR SELECT TO anon
  USING (visit_id IN (
    SELECT id FROM visits WHERE patient_id = (SELECT get_jwt_patient_id())
  ));

DROP POLICY IF EXISTS results_own ON results;
CREATE POLICY results_own ON results
  FOR SELECT TO anon
  USING (visit_test_id IN (
    SELECT id FROM visit_tests WHERE visit_id IN (
      SELECT id FROM visits WHERE patient_id = (SELECT get_jwt_patient_id())
    )
  ));

DROP POLICY IF EXISTS invoices_own ON invoices;
CREATE POLICY invoices_own ON invoices
  FOR SELECT TO anon
  USING (visit_id IN (
    SELECT id FROM visits WHERE patient_id = (SELECT get_jwt_patient_id())
  ));

DROP POLICY IF EXISTS payments_own ON payments;
CREATE POLICY payments_own ON payments
  FOR SELECT TO anon
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE visit_id IN (
      SELECT id FROM visits WHERE patient_id = (SELECT get_jwt_patient_id())
    )
  ));
