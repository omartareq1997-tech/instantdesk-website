-- Website live chat production foundation.
-- Adds website-channel tables used for typing, presence, tags, notes, reactions,
-- canned replies, timeline events, and message audit history.

alter table conversations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists live_chat_presence (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  visitor_status text not null default 'offline',
  visitor_last_seen_at timestamptz,
  agent_status text not null default 'offline',
  agent_last_seen_at timestamptz,
  visitor_context jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint live_chat_presence_visitor_status_check check (visitor_status in ('online', 'away', 'offline')),
  constraint live_chat_presence_agent_status_check check (agent_status in ('online', 'away', 'offline'))
);

create index if not exists live_chat_presence_business_updated_idx
  on live_chat_presence (business_id, updated_at desc);

create table if not exists live_chat_typing (
  conversation_id uuid not null references conversations(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  actor_type text not null,
  actor_name text not null default '',
  is_typing boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, actor_type, actor_name),
  constraint live_chat_typing_actor_type_check check (actor_type in ('visitor', 'agent'))
);

create table if not exists conversation_tags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  tag text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists conversation_tags_unique_idx
  on conversation_tags (conversation_id, tag);

create index if not exists conversation_tags_business_tag_idx
  on conversation_tags (business_id, lower(tag));

create table if not exists canned_replies (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title text not null,
  body text not null,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists canned_replies_business_active_idx
  on canned_replies (business_id, active, title);

create table if not exists message_reactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  actor_type text not null,
  actor_name text,
  reaction text not null,
  created_at timestamptz not null default now(),
  constraint message_reactions_actor_type_check check (actor_type in ('visitor', 'agent'))
);

create unique index if not exists message_reactions_unique_idx
  on message_reactions (message_id, actor_type, coalesce(actor_name, ''), reaction);

create table if not exists message_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  event_type text not null,
  before jsonb,
  after jsonb,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists message_audit_events_conversation_idx
  on message_audit_events (conversation_id, created_at desc);

create table if not exists visitor_timeline_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  event_type text not null,
  title text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists visitor_timeline_conversation_idx
  on visitor_timeline_events (conversation_id, created_at desc);

alter table live_chat_presence enable row level security;
alter table live_chat_typing enable row level security;
alter table conversation_tags enable row level security;
alter table canned_replies enable row level security;
alter table message_reactions enable row level security;
alter table message_audit_events enable row level security;
alter table visitor_timeline_events enable row level security;

drop policy if exists "live_chat_presence_owner_all" on live_chat_presence;
create policy "live_chat_presence_owner_all" on live_chat_presence for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "live_chat_typing_owner_all" on live_chat_typing;
create policy "live_chat_typing_owner_all" on live_chat_typing for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "conversation_tags_owner_all" on conversation_tags;
create policy "conversation_tags_owner_all" on conversation_tags for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "canned_replies_owner_all" on canned_replies;
create policy "canned_replies_owner_all" on canned_replies for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "message_reactions_owner_all" on message_reactions;
create policy "message_reactions_owner_all" on message_reactions for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "message_audit_events_owner_all" on message_audit_events;
create policy "message_audit_events_owner_all" on message_audit_events for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "visitor_timeline_events_owner_all" on visitor_timeline_events;
create policy "visitor_timeline_events_owner_all" on visitor_timeline_events for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

do $$ begin alter publication supabase_realtime add table live_chat_presence; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table live_chat_typing; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table conversation_tags; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table message_reactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table visitor_timeline_events; exception when duplicate_object then null; end $$;
