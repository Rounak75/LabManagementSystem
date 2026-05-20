CREATE TABLE payment_events (
  event_id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  razorpay_payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX payment_events_unprocessed_idx
  ON payment_events (received_at) WHERE processed_at IS NULL;
