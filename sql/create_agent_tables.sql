-- Run once in the Supabase SQL editor.
-- Creates agents and knowledge_sources for the AI chat backend.

-- ── agents ───────────────────────────────────────────────────────────
-- One active agent per business. The chat route loads this to build
-- the OpenAI system prompt (persona, tone, objective, fallback).

CREATE TABLE IF NOT EXISTS agents (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL,
  name           TEXT        NOT NULL DEFAULT 'AI Assistant',
  active         BOOLEAN     NOT NULL DEFAULT true,
  -- Core prompt fields assembled into the OpenAI system message
  persona        TEXT        NOT NULL DEFAULT 'You are a helpful assistant.',
  objective      TEXT        NOT NULL DEFAULT 'Qualify leads and book appointments.',
  tone           TEXT        NOT NULL DEFAULT 'professional',   -- 'friendly' | 'professional' | 'casual'
  fallback_msg   TEXT        NOT NULL DEFAULT 'Let me connect you with a human agent.',
  -- Optional overrides
  model          TEXT        NOT NULL DEFAULT 'gpt-4o-mini',   -- OpenAI model to use
  temperature    FLOAT       NOT NULL DEFAULT 0.4,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_business ON agents(business_id, active);

-- ── knowledge_sources ────────────────────────────────────────────────
-- Free-text documents injected into the system prompt.
-- Each row is a chunk: FAQs, pricing, services, policies, etc.

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL,
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,   -- raw text injected verbatim into system prompt
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_business ON knowledge_sources(business_id, is_active);
