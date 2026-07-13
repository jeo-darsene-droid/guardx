-- Migration 001: Add zone, rue, and email columns to prospects table
-- Run this in the Supabase SQL Editor or via the /api/zone/backfill endpoint

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS rue TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
