import { supabase, supabaseConfigStatus } from '@/lib/supabase';

import { localHealthKnowledge, type RagChunk } from './healthKnowledge';

type RagChunkRow = {
  id: string;
  title: string;
  category: RagChunk['category'];
  content: string;
  keywords: string[] | null;
  source: string | null;
  is_active: boolean;
};

export async function loadRagChunks(): Promise<RagChunk[]> {
  if (!supabaseConfigStatus.isConfigured) {
    return localHealthKnowledge;
  }

  const { data, error } = await supabase
    .from('rag_chunks')
    .select('id,title,category,content,keywords,source,is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error || !data?.length) {
    return localHealthKnowledge;
  }

  return (data as RagChunkRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    content: row.content,
    keywords: row.keywords ?? [],
    source: row.source ?? 'Supabase RAG corpus',
  }));
}
