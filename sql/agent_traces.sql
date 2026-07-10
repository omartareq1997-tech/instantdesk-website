create table if not exists agent_traces (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  bot_id uuid not null references agents(id) on delete cascade,
  conversation_id uuid null references conversations(id) on delete cascade,
  turn_id text null,
  request_id text null,
  event_type text not null,
  semantic_source text null,
  semantic_intent text null,
  model text null,
  latency_ms integer null,
  fallback_used boolean null,
  success boolean null,
  trace_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_traces_business_created_idx on agent_traces (business_id, created_at desc);
create index if not exists agent_traces_bot_created_idx on agent_traces (bot_id, created_at desc);
create index if not exists agent_traces_conversation_created_idx on agent_traces (conversation_id, created_at desc);
create index if not exists agent_traces_turn_idx on agent_traces (turn_id);
create index if not exists agent_traces_event_type_idx on agent_traces (event_type);

alter table agent_traces enable row level security;

drop policy if exists "agent_traces_owner_read" on agent_traces;
create policy "agent_traces_owner_read"
  on agent_traces for select
  using (
    exists (
      select 1
      from clients c
      where c.id = agent_traces.business_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "agent_traces_service_all" on agent_traces;
create policy "agent_traces_service_all"
  on agent_traces for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
