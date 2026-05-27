-- AI Follow-up System
-- Run once in Supabase SQL editor

-- 1. Per-business follow-up rule settings
CREATE TABLE IF NOT EXISTS follow_up_settings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL,
  trigger_type  TEXT        NOT NULL
    CHECK (trigger_type IN (
      'no_reply_2h', 'no_reply_24h', 'missed_appointment',
      'viewing_tomorrow', 'hot_lead_followup'
    )),
  enabled       BOOLEAN     NOT NULL DEFAULT false,
  delay_hours   NUMERIC(6,2) NOT NULL DEFAULT 2,
  tone          TEXT        NOT NULL DEFAULT 'friendly',
  custom_prompt TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, trigger_type)
);

-- 2. Follow-up queue
CREATE TABLE IF NOT EXISTS follow_ups (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL,
  lead_id         UUID,
  conversation_id UUID,
  trigger_type    TEXT        NOT NULL,
  scheduled_for   TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sent','cancelled','failed')),
  message         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

-- Worker index — only looks at scheduled rows
CREATE INDEX IF NOT EXISTS idx_follow_ups_worker
  ON follow_ups(business_id, status, scheduled_for)
  WHERE status = 'scheduled';

-- Enable realtime so dashboard gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE follow_ups;
