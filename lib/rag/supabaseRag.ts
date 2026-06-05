import { supabase, supabaseConfigStatus } from '@/lib/supabase';

import {
  localHealthKnowledge,
  normalizeRagCategory,
  type RagChunk,
  type RagReviewStatus,
  type RagRiskLevel,
  type RagSourceType,
} from './healthKnowledge';

type RagChunkRow = {
  id: string;
  title: string;
  category: string;
  topic: string | null;
  audience: RagChunk['audience'] | null;
  language: RagChunk['language'] | null;
  summary: string | null;
  content: string;
  keywords: string[] | null;
  source: string | null;
  source_url: string | null;
  source_type: RagSourceType | null;
  review_status: RagReviewStatus | null;
  risk_level: RagRiskLevel | null;
  medical_reviewer: string | null;
  last_reviewed_at: string | null;
  expires_at: string | null;
  token_budget: number | null;
  priority: number | null;
  is_active: boolean;
};

function toRagChunk(row: RagChunkRow): RagChunk {
  return {
    id: row.id,
    title: row.title,
    category: normalizeRagCategory(row.category),
    topic: row.topic ?? 'general',
    audience: row.audience ?? 'patient',
    language: row.language ?? 'th',
    summary: row.summary ?? row.content,
    content: row.content,
    keywords: row.keywords ?? [],
    source: row.source ?? 'Supabase RAG corpus',
    sourceUrl: row.source_url ?? undefined,
    sourceType: row.source_type ?? 'internal_policy',
    reviewStatus: row.review_status ?? 'draft',
    riskLevel: row.risk_level ?? 'low',
    medicalReviewer: row.medical_reviewer,
    lastReviewedAt: row.last_reviewed_at,
    expiresAt: row.expires_at,
    tokenBudget: row.token_budget ?? 320,
    priority: row.priority ?? 50,
  };
}

export async function loadRagChunks(): Promise<RagChunk[]> {
  if (!supabaseConfigStatus.isConfigured) {
    return localHealthKnowledge;
  }

  const { data, error } = await supabase
    .from('rag_chunks')
    .select(
      [
        'id',
        'title',
        'category',
        'topic',
        'audience',
        'language',
        'summary',
        'content',
        'keywords',
        'source',
        'source_url',
        'source_type',
        'review_status',
        'risk_level',
        'medical_reviewer',
        'last_reviewed_at',
        'expires_at',
        'token_budget',
        'priority',
        'is_active',
      ].join(','),
    )
    .eq('is_active', true)
    .eq('review_status', 'approved')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (error || !data?.length) {
    return localHealthKnowledge;
  }

  return (data as unknown as RagChunkRow[]).map(toRagChunk).filter((chunk) => chunk.reviewStatus === 'approved');
}
