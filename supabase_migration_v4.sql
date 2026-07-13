-- Guard-X Migration v4 — REQ Syndicats table
-- À exécuter dans le SQL Editor de Supabase (https://supabase.com/dashboard → SQL Editor)

CREATE TABLE IF NOT EXISTS req_syndicats (
    id BIGSERIAL PRIMARY KEY,
    neq TEXT DEFAULT '',
    nom TEXT DEFAULT '',
    statut_immat TEXT DEFAULT '',
    adresse_domicile TEXT DEFAULT '',
    adresse_postale TEXT DEFAULT '',
    ville_cp_domicile TEXT DEFAULT '',
    ville_cp_postale TEXT DEFAULT '',
    nom_normalise TEXT DEFAULT '',
    adresse_domicile_normalisee TEXT DEFAULT '',
    adresse_postale_normalisee TEXT DEFAULT '',
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_syndicats_nom_norm ON req_syndicats (nom_normalise);
CREATE INDEX IF NOT EXISTS idx_req_syndicats_dom_norm ON req_syndicats (adresse_domicile_normalisee);
CREATE INDEX IF NOT EXISTS idx_req_syndicats_neq ON req_syndicats (neq);

ALTER TABLE req_syndicats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'req_syndicats' AND policyname = 'Allow all for service role'
    ) THEN
        CREATE POLICY "Allow all for service role" ON req_syndicats FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
