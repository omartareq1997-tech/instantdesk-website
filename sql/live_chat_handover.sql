-- Live Chat + Human Handover schema for InstantDesk.
-- Run in Supabase SQL editor before enabling the dashboard feature in production.

-- 1. Extend existing conversations table without breaking existing rows.
alter table conversations
  add column if not exists unread_count int not null default 0,
  add column if not exists handover_requested_at timestamptz,
  add column if not exists human_takeover_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists assigned_to text;

-- Existing deployments used "open". Normalize new dashboard status values
-- without forcing a CHECK constraint that could break legacy inserts.
update conversations
set status = 'ai_active'
where status is null or status in ('open', 'pending');

-- 2. Extend messages with metadata used for status events and sender labels.
alter table messages
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists read_at timestamptz;

-- Optional forward-compatible role constraint. Existing deployments may only
-- allow user/assistant/system; human replies also work via metadata.sender_type.
alter table messages
  drop constraint if exists messages_role_check;

alter table messages
  add constraint messages_role_check
  check (role in ('user', 'assistant', 'system', 'human', 'agent'));

-- 3. Per-business live chat settings.
create table if not exists live_chat_settings (
  business_id uuid primary key references businesses(id) on delete cascade,
  ai_auto_replies_enabled boolean not null default true,
  live_chat_enabled boolean not null default false,
  human_handover_enabled boolean not null default true,
  trigger_ai_cannot_answer boolean not null default true,
  trigger_customer_asks_human boolean not null default true,
  trigger_phrases text[] not null default array['human','agent','support','talk to someone','real person'],
  availability_enabled boolean not null default false,
  availability_timezone text not null default 'Europe/Warsaw',
  availability_start time not null default '09:00',
  availability_end time not null default '17:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If an earlier version of this migration referenced clients(id), repair it.
alter table live_chat_settings
  drop constraint if exists live_chat_settings_business_id_fkey;

alter table live_chat_settings
  add constraint live_chat_settings_business_id_fkey
  foreign key (business_id) references businesses(id) on delete cascade;

-- 4. Optional audit trail for handover transitions.
create table if not exists handover_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  event_type text not null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table handover_events
  drop constraint if exists handover_events_business_id_fkey;

alter table handover_events
  add constraint handover_events_business_id_fkey
  foreign key (business_id) references businesses(id) on delete cascade;

create index if not exists conversations_business_status_idx
  on conversations (business_id, status, last_message_at desc);

create index if not exists messages_business_conversation_created_idx
  on messages (business_id, conversation_id, created_at);

create index if not exists handover_events_conversation_created_idx
  on handover_events (conversation_id, created_at desc);

-- 5. RLS policies. These match the current current_client_id() helper used by
-- sql/rls_all_tables.sql.
alter table live_chat_settings enable row level security;
alter table handover_events enable row level security;

drop policy if exists "live_chat_settings_owner_all" on live_chat_settings;
create policy "live_chat_settings_owner_all"
  on live_chat_settings for all
  using (business_id = current_client_id())
  with check (business_id = current_client_id());

drop policy if exists "handover_events_owner_all" on handover_events;
create policy "handover_events_owner_all"
  on handover_events for all
  using (business_id = current_client_id())
  with check (business_id = current_client_id());

-- 6. Realtime publication. Ignore duplicate-publication errors.
do $$
begin
  alter publication supabase_realtime add table conversations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table live_chat_settings;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table handover_events;
exception when duplicate_object then null;
end $$;
