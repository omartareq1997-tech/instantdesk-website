-- Run in Supabase SQL editor to enable per-business usage limits.

-- 1. Limits table (one row per business, upserted on first use)
create table if not exists business_limits (
  business_id           uuid primary key,
  max_sources           int  not null default 50,
  max_crawl_pages       int  not null default 25,
  max_knowledge_chars   int  not null default 500000,
  max_chunks            int  not null default 1000,
  max_ai_messages_month int  not null default 2000,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- 2. Helper: total chars stored across all knowledge_sources for a business
create or replace function get_business_knowledge_chars(p_business_id uuid)
returns bigint
language sql stable
as $$
  select coalesce(sum(length(content)), 0)
  from knowledge_sources
  where business_id = p_business_id;
$$;

-- 3. Helper: count AI messages sent this calendar month for a business
--    Assumes a conversations table with columns: business_id, created_at
--    and a messages table OR that messages are stored within conversations.
--    Adjust the table/column names below if your schema differs.
--    If you don't have a messages table, this function always returns 0 and
--    the limit is effectively unenforced until you wire it up.
create or replace function get_business_monthly_ai_messages(p_business_id uuid)
returns bigint
language sql stable
as $$
  select count(*)
  from conversations
  where business_id  = p_business_id
    and created_at  >= date_trunc('month', now());
$$;
