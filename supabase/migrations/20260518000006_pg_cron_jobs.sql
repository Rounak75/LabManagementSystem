-- Requires pg_cron extension (free tier supports it)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Daily prune of webhook_log entries older than 30 days
SELECT cron.schedule(
  'prune_webhook_log',
  '0 2 * * *',
  $$ DELETE FROM webhook_log WHERE received_at < now() - INTERVAL '30 days' $$
);

-- Daily snapshot of free-tier status
SELECT cron.schedule(
  'snapshot_free_tier_status',
  '5 2 * * *',
  $$
  INSERT INTO free_tier_status (db_size_bytes, db_size_pretty, auth_users)
  SELECT
    pg_database_size(current_database()),
    pg_size_pretty(pg_database_size(current_database())),
    (SELECT COUNT(*) FROM auth.users)
  $$
);

-- Daily prune of free_tier_status rows older than 90 days
SELECT cron.schedule(
  'prune_free_tier_status',
  '10 2 * * *',
  $$ DELETE FROM free_tier_status WHERE recorded_at < now() - INTERVAL '90 days' $$
);
