-- Bot workspace / default website bot foundation.
-- Safe additive migration. Existing agents remain intact.

alter table agents
  add column if not exists is_default_website_bot boolean not null default false,
  add column if not exists widget_key text,
  add column if not exists language text not null default 'en',
  add column if not exists business_type text;

create unique index if not exists idx_agents_one_default_website_bot
  on agents (business_id)
  where is_default_website_bot = true;

create index if not exists idx_agents_business_default
  on agents (business_id, is_default_website_bot, active);

create unique index if not exists idx_agents_widget_key
  on agents (widget_key)
  where widget_key is not null;

alter table knowledge_sources
  add column if not exists agent_id uuid references agents(id) on delete set null;

create index if not exists idx_knowledge_sources_agent
  on knowledge_sources (business_id, agent_id, is_active);

alter table knowledge_chunks
  add column if not exists agent_id uuid references agents(id) on delete set null;

create index if not exists idx_knowledge_chunks_agent
  on knowledge_chunks (business_id, agent_id);

alter table conversations
  add column if not exists agent_id uuid references agents(id) on delete set null;

create index if not exists idx_conversations_business_agent
  on conversations (business_id, agent_id, last_message_at desc);

alter table messages
  add column if not exists agent_id uuid references agents(id) on delete set null;

create index if not exists idx_messages_business_agent
  on messages (business_id, agent_id, created_at);
