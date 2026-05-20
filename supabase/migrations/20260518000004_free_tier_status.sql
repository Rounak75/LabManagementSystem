CREATE TABLE free_tier_status (
  id BIGSERIAL PRIMARY KEY,
  db_size_bytes BIGINT NOT NULL,
  db_size_pretty TEXT NOT NULL,
  auth_users INT NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- RPC for desktop schema-drift check
CREATE OR REPLACE FUNCTION information_schema_columns(table_names TEXT[])
RETURNS TABLE (table_name TEXT, column_name TEXT, data_type TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT c.table_name::TEXT, c.column_name::TEXT, c.data_type::TEXT
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = ANY(table_names);
$$;

GRANT EXECUTE ON FUNCTION information_schema_columns(TEXT[]) TO service_role;
