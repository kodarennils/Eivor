-- Vector similarity search over regelverk_chunks, used by /api/assess to
-- ground the bygglov assessment in actual source text. Plain SQL function
-- (not SECURITY DEFINER) since the underlying table is already publicly
-- readable via its own RLS policy.
create or replace function public.match_regelverk_chunks(
  query_embedding extensions.vector(1024),
  match_count int default 8
)
returns table (
  id uuid,
  source text,
  type text,
  valid_from date,
  paragraf_ref text,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    id,
    source,
    type,
    valid_from,
    paragraf_ref,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from public.regelverk_chunks
  order by embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_regelverk_chunks(extensions.vector(1024), int)
  to anon, authenticated;
