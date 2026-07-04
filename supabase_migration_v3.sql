-- Guard-X Migration v3 — Auto-update updated_at on prospects
-- À exécuter dans le SQL Editor de Supabase (https://supabase.com/dashboard → SQL Editor)

-- Create a function that sets updated_at to NOW() on row update
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create it
DROP TRIGGER IF EXISTS trg_prospects_updated_at ON prospects;

CREATE TRIGGER trg_prospects_updated_at
    BEFORE UPDATE ON prospects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
