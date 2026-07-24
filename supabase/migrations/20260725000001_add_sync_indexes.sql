-- Add performance indexes for cloud sync worker polling columns
-- These prevent full table scans when desktop apps poll for changes via .gt("updated_at", ...)

CREATE INDEX IF NOT EXISTS patients_updated_at_idx ON patients (updated_at);
CREATE INDEX IF NOT EXISTS visits_updated_at_idx ON visits (updated_at);
CREATE INDEX IF NOT EXISTS results_updated_at_idx ON results (updated_at);
CREATE INDEX IF NOT EXISTS payments_updated_at_idx ON payments (updated_at);
CREATE INDEX IF NOT EXISTS bookings_updated_at_idx ON bookings (updated_at);
CREATE INDEX IF NOT EXISTS disputes_created_at_idx ON disputes (created_at);
CREATE INDEX IF NOT EXISTS visits_verified_at_idx ON visits (verified_at);
CREATE INDEX IF NOT EXISTS print_jobs_requested_at_idx ON print_jobs (requested_at);
CREATE INDEX IF NOT EXISTS payment_events_received_at_idx ON payment_events (received_at);
