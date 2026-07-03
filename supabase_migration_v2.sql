-- Guard-X Migration v2 — Suivi de prospection avancé
-- À exécuter dans le SQL Editor de Supabase (https://supabase.com/dashboard → SQL Editor)
-- Sans danger : uniquement des ajouts, aucune donnée existante n'est modifiée.

-- 0. Nouveau champ config : titre du représentant
ALTER TABLE config ADD COLUMN IF NOT EXISTS rep_title TEXT DEFAULT 'Gestionnaire de comptes clients';

-- 1. Nouveaux champs sur les prospects : segment + prochaine action
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS next_action TEXT DEFAULT '';

-- 2. Base clients (export Sage) — garde-fou anti-doublons
CREATE TABLE IF NOT EXISTS base_clients (
    id BIGSERIAL PRIMARY KEY,
    nom TEXT DEFAULT '',
    contact TEXT DEFAULT '',
    telephone TEXT DEFAULT '',
    adresse TEXT DEFAULT '',
    adresse_normalisee TEXT DEFAULT '',
    service TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_base_clients_adresse_norm ON base_clients (adresse_normalisee);

ALTER TABLE base_clients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'base_clients' AND policyname = 'Allow all for service role'
    ) THEN
        CREATE POLICY "Allow all for service role" ON base_clients FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
