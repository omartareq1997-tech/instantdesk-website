-- Phase 3: Unified Customer Identity foundation.
-- Additive only. Does not connect external providers.

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  display_name text,
  primary_email text,
  primary_phone text,
  avatar text,
  company text,
  country text,
  language text,
  timezone text,
  notes text,
  lead_score integer not null default 0,
  lifetime_value numeric(12,2) not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customer_identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null check (channel in ('website', 'whatsapp', 'messenger', 'instagram', 'email', 'phone', 'account')),
  external_identifier text not null,
  confidence_score integer not null default 100 check (confidence_score >= 0 and confidence_score <= 100),
  verified boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (channel, external_identifier)
);

create table if not exists customer_merge_history (
  id uuid primary key default gen_random_uuid(),
  source_customer_id uuid not null,
  target_customer_id uuid not null references customers(id) on delete cascade,
  merged_by text,
  reason text,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists customer_identity_suggestions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  source_customer_id uuid not null references customers(id) on delete cascade,
  target_customer_id uuid not null references customers(id) on delete cascade,
  reason text not null default 'Possible duplicate',
  confidence_score integer not null default 0 check (confidence_score >= 0 and confidence_score <= 100),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'ignored')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, source_customer_id, target_customer_id)
);

alter table conversations
  add column if not exists customer_id uuid references customers(id) on delete set null;

create index if not exists customers_business_updated_idx on customers (business_id, updated_at desc);
create index if not exists customers_business_email_idx on customers (business_id, lower(primary_email)) where primary_email is not null;
create index if not exists customers_business_phone_idx on customers (business_id, primary_phone) where primary_phone is not null;
create index if not exists customer_identities_customer_idx on customer_identities (customer_id);
create index if not exists customer_identities_lookup_idx on customer_identities (channel, lower(external_identifier));
create index if not exists customer_merge_history_target_idx on customer_merge_history (target_customer_id, created_at desc);
create index if not exists customer_identity_suggestions_business_idx on customer_identity_suggestions (business_id, status, confidence_score desc);
create index if not exists conversations_customer_idx on conversations (business_id, customer_id);

alter table customers enable row level security;
alter table customer_identities enable row level security;
alter table customer_merge_history enable row level security;
alter table customer_identity_suggestions enable row level security;

drop policy if exists "customers_owner_all" on customers;
create policy "customers_owner_all" on customers for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "customer_identities_owner_all" on customer_identities;
create policy "customer_identities_owner_all" on customer_identities for all
  using (exists (select 1 from customers c where c.id = customer_identities.customer_id and c.business_id = current_client_id()))
  with check (exists (select 1 from customers c where c.id = customer_identities.customer_id and c.business_id = current_client_id()));

drop policy if exists "customer_merge_history_owner_all" on customer_merge_history;
create policy "customer_merge_history_owner_all" on customer_merge_history for all
  using (exists (select 1 from customers c where c.id = customer_merge_history.target_customer_id and c.business_id = current_client_id()))
  with check (exists (select 1 from customers c where c.id = customer_merge_history.target_customer_id and c.business_id = current_client_id()));

drop policy if exists "customer_identity_suggestions_owner_all" on customer_identity_suggestions;
create policy "customer_identity_suggestions_owner_all" on customer_identity_suggestions for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

do $$ begin alter publication supabase_realtime add table customers; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table customer_identities; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table customer_merge_history; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table customer_identity_suggestions; exception when duplicate_object then null; end $$;
