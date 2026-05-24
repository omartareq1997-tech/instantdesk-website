-- Run once in the Supabase SQL editor to enable the invite acceptance flow.
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS password_hash TEXT;
