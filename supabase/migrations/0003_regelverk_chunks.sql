-- Chunked, embedded regulatory source material for the RAG system
-- (plan- och bygglagen, Boverkets föreskrifter, vägledningstexter).
-- Embeddings are 1024-dim vectors from Voyage AI's voyage-multilingual-2
-- (see scripts/ingest-regelverk.mjs).

create table if not exists public.regelverk_chunks (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  type text not null check (type in ('lag', 'föreskrift', 'vägledning')),
  valid_from date,
  paragraf_ref text,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now()
);

create index if not exists regelverk_chunks_source_idx on public.regelverk_chunks(source);
create index if not exists regelverk_chunks_type_idx on public.regelverk_chunks(type);

-- Vector index for cosine similarity search over the embeddings. HNSW
-- needs pgvector >= 0.5.0; fall back to ivfflat on older versions so the
-- rest of this migration still applies.
do $$
begin
  begin
    execute 'create index if not exists regelverk_chunks_embedding_idx
      on public.regelverk_chunks
      using hnsw (embedding extensions.vector_cosine_ops)';
  exception when undefined_object then
    execute 'create index if not exists regelverk_chunks_embedding_idx
      on public.regelverk_chunks
      using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100)';
  end;
end $$;

-- This is public regulatory reference data, not user data: readable by
-- anyone, writable only by the ingestion script (service role, which
-- bypasses RLS - no insert/update/delete policy is defined here).
alter table public.regelverk_chunks enable row level security;

drop policy if exists "Anyone can read regelverk chunks" on public.regelverk_chunks;
create policy "Anyone can read regelverk chunks"
  on public.regelverk_chunks
  for select
  using (true);
