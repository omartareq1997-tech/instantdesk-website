-- Run once in the Supabase SQL editor.
-- Adds the fallback_msg column to the agents table.
-- The CREATE TABLE IF NOT EXISTS in create_agent_tables.sql only runs if the
-- table does not yet exist, so this ALTER is needed for existing deployments.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS fallback_msg TEXT NOT NULL DEFAULT 'Let me connect you with a human agent.';
