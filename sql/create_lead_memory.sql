-- Lead memory table — stores per-lead AI context across conversation turns.
-- Run in the Supabase SQL editor.

create table if not exists lead_memory (
  id                uuid        primary key default gen_random_uuid(),
  business_id       uuid        not null,
  lead_id           uuid        not null,
  conversation_id   uuid,
  -- Behavioural fields (deterministically extracted, no LLM)
  preferences       text,        -- property type, rooms, deal type
  budget            text,
  desired_location  text,        -- city + area joined
  urgency           text,        -- 'high' | 'medium' | 'low'
  objections        text,        -- detected friction signals
  viewed_properties text,        -- URLs / property names mentioned
  language          text,        -- detected conversation language
  summary           text,        -- compact one-liner of confirmed context
  last_user_intent  text,        -- last user message (truncated)
  next_best_action  text,        -- derived from qualification stage
  updated_at        timestamptz  not null default now(),
  created_at        timestamptz  not null default now(),
  unique (business_id, lead_id)
);

create index if not exists idx_lead_memory_business_lead on lead_memory (business_id, lead_id);
create index if not exists idx_lead_memory_conversation  on lead_memory (conversation_id);

-- RLS (admin client bypasses; these guard direct/anon access)
alter table lead_memory enable row level security;

drop policy if exists "owners can manage own lead_memory"       on lead_memory;
drop policy if exists "team members can select own lead_memory" on lead_memory;

create policy "owners can manage own lead_memory"
  on lead_memory for all
  using (
    business_id in (select id from clients where user_id = auth.uid())
  )
  with check (
    business_id in (select id from clients where user_id = auth.uid())
  );
