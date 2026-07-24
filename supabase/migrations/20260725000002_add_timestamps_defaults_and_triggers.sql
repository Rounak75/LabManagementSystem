-- Enable the moddatetime extension to automatically update timestamps
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

DO $$
DECLARE
    t_name text;
BEGIN
    -- Loop through all tables in the public schema that have an 'updated_at' column
    FOR t_name IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND column_name = 'updated_at'
    LOOP
        -- Set the default value to now() if not already set
        EXECUTE format('ALTER TABLE %I ALTER COLUMN updated_at SET DEFAULT now();', t_name);
        
        -- Drop the trigger if it exists so we can safely recreate it
        EXECUTE format('DROP TRIGGER IF EXISTS handle_updated_at ON %I;', t_name);
        
        -- Create the trigger using the moddatetime function
        EXECUTE format('CREATE TRIGGER handle_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime(updated_at);', t_name);
    END LOOP;

    -- Loop through all tables in the public schema that have a 'created_at' column
    FOR t_name IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND column_name = 'created_at'
    LOOP
        -- Set the default value to now() if not already set
        EXECUTE format('ALTER TABLE %I ALTER COLUMN created_at SET DEFAULT now();', t_name);
    END LOOP;
END $$;
