CREATE OR REPLACE FUNCTION snapshot_free_tier_status_now()
RETURNS free_tier_status
LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO free_tier_status (db_size_bytes, db_size_pretty, auth_users)
  SELECT
    pg_database_size(current_database()),
    pg_size_pretty(pg_database_size(current_database())),
    (SELECT COUNT(*) FROM auth.users)
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION snapshot_free_tier_status_now() TO service_role;
