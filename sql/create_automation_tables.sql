-- Run once in the Supabase SQL editor.
-- Creates automation_settings and automation_logs for the Make.com control center.
--
-- Architecture note:
--   InstantDesk stores configuration here.
--   Make.com reads these settings before executing each scenario.
--   Make.com writes execution results to automation_logs.

-- ── automation_settings ───────────────────────────────────────────
-- One row per (client, automation_type). Make.com reads enabled/channel/delay/config
-- before deciding whether to run a scenario and how to send the message.

CREATE TABLE IF NOT EXISTS automation_settings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL,
  automation_type  TEXT        NOT NULL,
  enabled          BOOLEAN     NOT NULL DEFAULT false,
  channel          TEXT        NOT NULL DEFAULT 'whatsapp',  -- 'whatsapp' | 'sms' | 'email'
  delay_minutes    INTEGER     NOT NULL DEFAULT 0,
  -- JSONB config read by Make.com:
  --   ai_message:          bool  — generate message via AI instead of template
  --   business_hours_only: bool  — Make.com skips runs outside 09:00-18:00
  --   assigned_agent_only: bool  — Make.com only runs for leads with an assigned agent
  config           JSONB       NOT NULL DEFAULT '{}',
  message_template TEXT        NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, automation_type)
);

-- ── automation_logs ───────────────────────────────────────────────
-- Written by Make.com after each scenario execution.
-- InstantDesk reads these to display run history and success/failure counts.

CREATE TABLE IF NOT EXISTS automation_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        NOT NULL,
  automation_type  TEXT        NOT NULL,
  lead_id          UUID        REFERENCES leads(id) ON DELETE SET NULL,
  appointment_id   UUID        REFERENCES appointments(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'success',  -- 'success' | 'failure' | 'skipped'
  message          TEXT,
  execution_result JSONB,      -- full Make.com webhook response for debugging
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast per-client queries
CREATE INDEX IF NOT EXISTS idx_automation_settings_client ON automation_settings(client_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_client     ON automation_logs(client_id, automation_type);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created    ON automation_logs(created_at DESC);
