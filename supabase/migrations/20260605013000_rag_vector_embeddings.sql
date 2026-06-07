create extension if not exists vector with schema extensions;

alter table public.rag_chunks
  add column if not exists embedding extensions.vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedding_dimensions integer,
  add column if not exists embedding_updated_at timestamptz;

create index if not exists rag_chunks_embedding_hnsw_idx
  on public.rag_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null
    and is_active = true
    and review_status = 'approved';

create or replace function public.match_rag_chunks(
  query_embedding text,
  match_threshold float default 0.62,
  match_count integer default 6,
  category_filter text[] default null
)
returns table (
  id text,
  title text,
  category text,
  topic text,
  audience text,
  language text,
  summary text,
  content text,
  keywords text[],
  source text,
  source_url text,
  source_type text,
  review_status text,
  risk_level text,
  medical_reviewer text,
  last_reviewed_at timestamptz,
  expires_at timestamptz,
  token_budget integer,
  priority integer,
  similarity float
)
language sql stable
as $$
  select
    rag_chunks.id,
    rag_chunks.title,
    rag_chunks.category,
    rag_chunks.topic,
    rag_chunks.audience,
    rag_chunks.language,
    rag_chunks.summary,
    rag_chunks.content,
    rag_chunks.keywords,
    rag_chunks.source,
    rag_chunks.source_url,
    rag_chunks.source_type,
    rag_chunks.review_status,
    rag_chunks.risk_level,
    rag_chunks.medical_reviewer,
    rag_chunks.last_reviewed_at,
    rag_chunks.expires_at,
    rag_chunks.token_budget,
    rag_chunks.priority,
    1 - (rag_chunks.embedding OPERATOR(extensions.<=>) query_embedding::extensions.vector(768)) as similarity
  from public.rag_chunks
  where rag_chunks.is_active = true
    and rag_chunks.review_status = 'approved'
    and rag_chunks.embedding is not null
    and (
      category_filter is null
      or cardinality(category_filter) = 0
      or rag_chunks.category = any(category_filter)
    )
    and 1 - (rag_chunks.embedding OPERATOR(extensions.<=>) query_embedding::extensions.vector(768)) >= match_threshold
  order by rag_chunks.embedding OPERATOR(extensions.<=>) query_embedding::extensions.vector(768) asc, rag_chunks.priority asc, rag_chunks.created_at asc
  limit least(match_count, 20);
$$;

create or replace function public.update_rag_chunk_embedding(
  p_chunk_id text,
  p_embedding text,
  p_embedding_model text,
  p_embedding_dimensions integer default 768
)
returns table (
  id text,
  embedding_model text,
  embedding_dimensions integer,
  embedding_updated_at timestamptz
)
language plpgsql
as $$
begin
  if p_embedding_dimensions <> 768 then
    raise exception 'Unsupported embedding dimensions: %', p_embedding_dimensions;
  end if;

  return query
  update public.rag_chunks
  set
    embedding = p_embedding::extensions.vector(768),
    embedding_model = p_embedding_model,
    embedding_dimensions = p_embedding_dimensions,
    embedding_updated_at = now(),
    updated_at = now()
  where rag_chunks.id = p_chunk_id
  returning
    rag_chunks.id,
    rag_chunks.embedding_model,
    rag_chunks.embedding_dimensions,
    rag_chunks.embedding_updated_at;
end;
$$;

grant execute on function public.match_rag_chunks(text, float, integer, text[]) to anon, authenticated;
grant execute on function public.update_rag_chunk_embedding(text, text, text, integer) to authenticated;
