-- Enable RLS on all synced tables
ALTER TABLE patients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE parameters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_tests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_visits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE free_tier_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS by default in Supabase; no explicit policy needed.

-- anon (patient portal): SELECT only on patient-scoped tables, filtered by JWT claim patient_id
CREATE POLICY patient_own_record ON patients
  FOR SELECT TO anon
  USING (id = current_setting('request.jwt.claims', true)::jsonb ->> 'patient_id');

CREATE POLICY visits_own ON visits
  FOR SELECT TO anon
  USING (patient_id = current_setting('request.jwt.claims', true)::jsonb ->> 'patient_id');

CREATE POLICY visit_tests_own ON visit_tests
  FOR SELECT TO anon
  USING (visit_id IN (
    SELECT id FROM visits WHERE patient_id = current_setting('request.jwt.claims', true)::jsonb ->> 'patient_id'
  ));

CREATE POLICY results_own ON results
  FOR SELECT TO anon
  USING (visit_test_id IN (
    SELECT id FROM visit_tests WHERE visit_id IN (
      SELECT id FROM visits WHERE patient_id = current_setting('request.jwt.claims', true)::jsonb ->> 'patient_id'
    )
  ));

CREATE POLICY invoices_own ON invoices
  FOR SELECT TO anon
  USING (visit_id IN (
    SELECT id FROM visits WHERE patient_id = current_setting('request.jwt.claims', true)::jsonb ->> 'patient_id'
  ));

CREATE POLICY payments_own ON payments
  FOR SELECT TO anon
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE visit_id IN (
      SELECT id FROM visits WHERE patient_id = current_setting('request.jwt.claims', true)::jsonb ->> 'patient_id'
    )
  ));

-- doctors / tests / parameters / lab_settings: public read for anon (needed to render reports in patient portal)
CREATE POLICY public_read ON doctors      FOR SELECT TO anon USING (true);
CREATE POLICY public_read ON tests        FOR SELECT TO anon USING (true);
CREATE POLICY public_read ON parameters   FOR SELECT TO anon USING (true);
CREATE POLICY public_read ON lab_settings FOR SELECT TO anon USING (true);
