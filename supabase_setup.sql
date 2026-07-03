-- Guard-X Supabase Schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- 1. Config table (key-value store for app settings)
CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    rep_name TEXT DEFAULT '',
    rep_title TEXT DEFAULT 'Gestionnaire de comptes clients',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    default_mode TEXT DEFAULT 'postal',
    logo_path TEXT DEFAULT 'assets/guardx_logo.png',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config row
INSERT INTO config (id, rep_name, phone, email, default_mode, logo_path)
VALUES (1, 'Jéo-Darsène Saint-Louis', '438-406-5077', 'jdsaintlouis@guard-x.com', 'postal', 'assets/guardx_logo.png')
ON CONFLICT (id) DO NOTHING;

-- 2. Activity log table
CREATE TABLE IF NOT EXISTS activity_log (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL DEFAULT '',
    detail TEXT DEFAULT '',
    detail_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast recent-activity queries
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);

-- 3. Prospects table
CREATE TABLE IF NOT EXISTS prospects (
    id BIGSERIAL PRIMARY KEY,
    entreprise TEXT DEFAULT '',
    contact TEXT DEFAULT '',
    telephone TEXT DEFAULT '',
    statut TEXT DEFAULT 'À contacter',
    date TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    adresse TEXT DEFAULT '',
    ville TEXT DEFAULT '',
    nb_unites TEXT DEFAULT '',
    secteur TEXT DEFAULT '',
    contacte BOOLEAN DEFAULT FALSE,
    date_contact TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (allow all via service key)
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

-- Policies: allow full access for authenticated/service role
CREATE POLICY "Allow all for service role" ON config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON prospects FOR ALL USING (true) WITH CHECK (true);
