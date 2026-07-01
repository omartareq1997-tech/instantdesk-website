-- Omnichannel inbox foundation for InstantDesk.
-- Safe to run after sql/live_chat_handover.sql. This is foundation only:
-- provider OAuth, token storage, and external message ingestion are intentionally
-- not implemented here.

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  type text not null,
  provider text not null default 'instantdesk',
  external_account_id text,
  status text not null default 'disabled',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channels_type_check
    check (type in ('website', 'whatsapp', 'messenger', 'instagram', 'email')),
  constraint channels_status_check
    check (status in ('disabled', 'pending', 'connected', 'error'))
);

comment on column channels.config is
  'Provider settings only. Do not store raw access tokens in plaintext; store encrypted token references or provider metadata.';

create unique index if not exists channels_business_type_provider_account_uidx
  on channels (business_id, type, provider, coalesce(external_account_id, ''));

create index if not exists channels_business_status_idx
  on channels (business_id, status, type);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text,
  email text,
  phone text,
  avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_business_created_idx
  on contacts (business_id, created_at desc);

create unique index if not exists contacts_business_email_uidx
  on contacts (business_id, lower(email))
  where email is not null and email <> '';

create unique index if not exists contacts_business_phone_uidx
  on contacts (business_id, phone)
  where phone is not null and phone <> '';

alter table conversations
  add column if not exists contact_id uuid references contacts(id) on delete set null,
  add column if not exists channel_id uuid references channels(id) on delete set null,
  add column if not exists external_thread_id text,
  add column if not exists channel text not null default 'website',
  add column if not exists assigned_to text,
  add column if not exists unread_count int not null default 0,
  add column if not exists last_message_at timestamptz;

update conversations
set channel = 'website'
where channel is null or channel = '';

update conversations
set last_message_at = coalesce(last_message_at, created_at, now())
where last_message_at is null;

do $$
begin
  alter table conversations
    add constraint conversations_channel_check
    check (channel in ('website', 'whatsapp', 'messenger', 'instagram', 'email'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table conversations
    add constraint conversations_unread_count_check
    check (unread_count >= 0);
exception
  when duplicate_object then null;
end $$;

create index if not exists conversations_business_channel_status_idx
  on conversations (business_id, channel, status, last_message_at desc);

create index if not exists conversations_business_contact_idx
  on conversations (business_id, contact_id);

create index if not exists conversations_channel_external_thread_idx
  on conversations (channel_id, external_thread_id)
  where external_thread_id is not null;

alter table messages
  add column if not exists delivery_status text not null default 'delivered',
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists external_message_id text,
  add column if not exists attachment_metadata jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  alter table messages
    add constraint messages_delivery_status_check
    check (delivery_status in ('sent', 'delivered', 'seen', 'failed'));
exception
  when duplicate_object then null;
end $$;

create index if not exists messages_business_delivery_idx
  on messages (business_id, delivery_status, created_at desc);

create index if not exists messages_external_message_idx
  on messages (business_id, external_message_id)
  where external_message_id is not null;

alter table channels enable row level security;
alter table contacts enable row level security;

drop policy if exists "channels_owner_all" on channels;
create policy "channels_owner_all"
  on channels for all
  using (business_id = current_client_id())
  with check (business_id = current_client_id());

drop policy if exists "contacts_owner_all" on contacts;
create policy "contacts_owner_all"
  on contacts for all
  using (business_id = current_client_id())
  with check (business_id = current_client_id());

do $$
begin
  alter publication supabase_realtime add table channels;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table contacts;
exception when duplicate_object then null;
end $$;
