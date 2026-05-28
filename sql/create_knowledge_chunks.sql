-- Run in Supabase SQL editor BEFORE using RAG features.
-- Requires pgvector extension (enabled on all Supabase projects).

-- 1. Enable pgvector
create extension if not exists vector;

-- 2. Chunks table
create table if not exists knowledge_chunks (
  id           uuid        primary key default gen_random_uuid(),
  business_id  uuid        not null,
  source_id    uuid        references knowledge_sources(id) on delete cascade,
  source_title text,
  source_url   text,
  content      text        not null,
  embedding    vector(1536),
  metadata     jsonb       default '{}'::jsonb,
  created_at   timestamptz default now()
);

-- 3. HNSW index for fast cosine similarity search (requires pgvector 0.5+)
create index if not exists idx_knowledge_chunks_embedding
  on knowledge_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists idx_knowledge_chunks_business
  on knowledge_chunks (business_id);

-- 4. RPC function — called from /api/chat to retrieve top-k relevant chunks
create or replace function match_knowledge_chunks(
  query_embedding   vector(1536),
  match_business_id uuid,
  match_count       int default 6
)
returns table (
  id           uuid,
  source_id    uuid,
  source_title text,
  source_url   text,
  content      text,
  similarity   float
)
language sql stable
as $$
  select
    kc.id,
    kc.source_id,
    kc.source_title,
    kc.source_url,
    kc.content,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where kc.business_id = match_business_id
    and kc.embedding   is not null
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
