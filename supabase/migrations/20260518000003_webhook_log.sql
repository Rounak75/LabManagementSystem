CREATE TABLE webhook_log (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL,
  payload TEXT,
  error TEXT,
  received_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX webhook_log_received_at_idx ON webhook_log (received_at);
