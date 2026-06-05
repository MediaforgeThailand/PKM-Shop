import { supabase, supabaseConfigStatus } from '@/lib/supabase';

import type { ExtractedHealthFact, HealthFactType } from './healthFactExtractor';

export type ConsentPurpose =
  | 'ai_processing'
  | 'chat_health_memory'
  | 'chat_history'
  | 'health_analytics'
  | 'hospital_data_sharing';

export type HealthMemoryStatus =
  | {
      consentGranted: false;
      reason: 'supabase_not_configured' | 'not_authenticated';
      userId: null;
    }
  | {
      consentGranted: boolean;
      consentId?: string;
      reason: 'ready';
      userId: string;
    };

export type PersistHealthFactsResult =
  | {
      savedCount: number;
      status: 'saved';
    }
  | {
      reason: 'supabase_not_configured' | 'not_authenticated' | 'no_facts';
      savedCount: 0;
      status: 'skipped';
    };

export type StoredHealthFact = {
  id: string;
  factType: HealthFactType;
  label: string;
  value: string;
  unit?: string | null;
  confidence: number;
  status: 'confirmed' | 'deleted' | 'pending' | 'rejected';
  createdAt: string;
  updatedAt: string;
};

export type HealthDataSnapshot = {
  consents: {
    createdAt: string;
    purpose: ConsentPurpose;
    status: 'granted' | 'revoked';
    version: string;
  }[];
  facts: StoredHealthFact[];
  exportedAt: string;
};

type ConsentRow = {
  id: string;
  status: 'granted' | 'revoked';
};

type InsertedId = {
  id: string;
};

type HealthFactRow = {
  id: string;
  fact_type: HealthFactType;
  label: string;
  value: string;
  unit: string | null;
  confidence: number;
  status: StoredHealthFact['status'];
  created_at: string;
  updated_at: string;
};

type ConsentSnapshotRow = {
  created_at: string;
  purpose: ConsentPurpose;
  status: 'granted' | 'revoked';
  version: string;
};

const HEALTH_MEMORY_PURPOSE: ConsentPurpose = 'chat_health_memory';
const CONSENT_VERSION = '2026-06-04-health-memory-v1';

type HealthMemoryLogInput = {
  action: 'auto_save' | 'delete' | 'export' | 'manual_save' | 'review' | 'revoke';
  factCount?: number;
  factTypes?: HealthFactType[];
  metadata?: Record<string, unknown>;
  status: 'error' | 'skipped' | 'started' | 'success' | 'warning';
};

async function getCurrentUserId() {
  if (!supabaseConfigStatus.isConfigured) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

async function insertHealthMemoryLog(userId: string, input: HealthMemoryLogInput) {
  const { error } = await supabase.from('health_memory_logs').insert({
    action: input.action,
    fact_count: input.factCount ?? 0,
    fact_types: input.factTypes ?? [],
    metadata: input.metadata ?? {},
    status: input.status,
    user_id: userId,
  });

  if (error) {
    // Observability should not block the user flow while migrations are rolling out.
    return;
  }
}

export async function createHealthMemoryLog(input: HealthMemoryLogInput) {
  if (!supabaseConfigStatus.isConfigured) {
    return;
  }

  const userId = await getCurrentUserId();

  if (!userId) {
    return;
  }

  await insertHealthMemoryLog(userId, input);
}

function uniqueFactTypes(facts: ExtractedHealthFact[]) {
  return [...new Set(facts.map((fact) => fact.factType))];
}

function toStoredHealthFact(row: HealthFactRow): StoredHealthFact {
  return {
    id: row.id,
    factType: row.fact_type,
    label: row.label,
    value: row.value,
    unit: row.unit,
    confidence: row.confidence,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getLatestConsent(userId: string, purpose: ConsentPurpose): Promise<ConsentRow | null> {
  const { data, error } = await supabase
    .from('consents')
    .select('id,status')
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ConsentRow;
}

async function grantConsent(userId: string, purpose: ConsentPurpose) {
  const { data, error } = await supabase
    .from('consents')
    .insert({
      user_id: userId,
      purpose,
      status: 'granted',
      version: CONSENT_VERSION,
      source: 'chatbot',
      granted_at: new Date().toISOString(),
      metadata: {
        consent_text:
          'User allowed Mira to store reviewed health facts extracted from chat for health profile and future analytics.',
      },
    })
    .select('id,status')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ConsentRow;
}

async function ensureHealthMemoryConsent(userId: string) {
  const latestConsent = await getLatestConsent(userId, HEALTH_MEMORY_PURPOSE);

  if (latestConsent?.status === 'granted') {
    return latestConsent;
  }

  return grantConsent(userId, HEALTH_MEMORY_PURPOSE);
}

async function createChatSession(userId: string, question: string) {
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      user_id: userId,
      title: question.slice(0, 80),
      source: 'chatbot',
      metadata: {
        purpose: HEALTH_MEMORY_PURPOSE,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data as InsertedId).id;
}

async function createChatMessage({
  content,
  model,
  ragChunkIds,
  role,
  sessionId,
  userId,
}: {
  content: string;
  model?: string;
  ragChunkIds?: string[];
  role: 'assistant' | 'user';
  sessionId: string;
  userId: string;
}) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      user_id: userId,
      role,
      content,
      rag_chunk_ids: ragChunkIds ?? [],
      model,
      metadata: {
        stored_for: HEALTH_MEMORY_PURPOSE,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return (data as InsertedId).id;
}

function toHealthFactRow(fact: ExtractedHealthFact, userId: string, consentId: string, messageId: string) {
  return {
    user_id: userId,
    consent_id: consentId,
    source_message_id: messageId,
    fact_type: fact.factType,
    label: fact.label,
    value: fact.value,
    normalized_value: fact.normalizedValue,
    unit: fact.unit,
    confidence: fact.confidence,
    status: 'confirmed',
    source: 'chatbot_extraction',
    confirmed_at: new Date().toISOString(),
    metadata: {
      local_id: fact.localId,
      user_reviewed: true,
    },
  };
}

async function createAuditLogs(userId: string, facts: InsertedId[]) {
  if (facts.length === 0) {
    return;
  }

  const { error } = await supabase.from('data_access_logs').insert(
    facts.map((fact) => ({
      user_id: userId,
      actor_user_id: userId,
      actor_type: 'user',
      action: 'create',
      resource_type: 'health_fact',
      resource_id: fact.id,
      purpose: HEALTH_MEMORY_PURPOSE,
      metadata: {
        source: 'chatbot_confirmation',
      },
    })),
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function getHealthMemoryStatus(): Promise<HealthMemoryStatus> {
  if (!supabaseConfigStatus.isConfigured) {
    return {
      consentGranted: false,
      reason: 'supabase_not_configured',
      userId: null,
    };
  }

  const userId = await getCurrentUserId();

  if (!userId) {
    return {
      consentGranted: false,
      reason: 'not_authenticated',
      userId: null,
    };
  }

  const latestConsent = await getLatestConsent(userId, HEALTH_MEMORY_PURPOSE);

  return {
    consentGranted: latestConsent?.status === 'granted',
    consentId: latestConsent?.status === 'granted' ? latestConsent.id : undefined,
    reason: 'ready',
    userId,
  };
}

export async function listConfirmedHealthFacts(): Promise<StoredHealthFact[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from('health_facts')
    .select('id,fact_type,label,value,unit,confidence,status,created_at,updated_at')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as HealthFactRow[]).map(toStoredHealthFact);
}

export async function deleteHealthFact(factId: string) {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('ต้อง login ก่อนจัดการข้อมูลสุขภาพ');
  }

  const { error } = await supabase
    .from('health_facts')
    .update({
      deleted_at: new Date().toISOString(),
      status: 'deleted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', factId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(error.message);
  }

  const { error: logError } = await supabase.from('data_access_logs').insert({
    user_id: userId,
    actor_user_id: userId,
    actor_type: 'user',
    action: 'delete',
    resource_type: 'health_fact',
    resource_id: factId,
    purpose: HEALTH_MEMORY_PURPOSE,
    metadata: {
      source: 'profile',
    },
  });

  if (logError) {
    throw new Error(logError.message);
  }

  await insertHealthMemoryLog(userId, {
    action: 'delete',
    factCount: 1,
    metadata: {
      fact_id: factId,
      source: 'profile',
    },
    status: 'success',
  });
}

export async function revokeHealthMemoryConsent() {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('ต้อง login ก่อนถอน consent');
  }

  const { error } = await supabase.from('consents').insert({
    user_id: userId,
    purpose: HEALTH_MEMORY_PURPOSE,
    status: 'revoked',
    version: CONSENT_VERSION,
    source: 'profile',
    revoked_at: new Date().toISOString(),
    metadata: {
      reason: 'user_revoked_from_profile',
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const { error: logError } = await supabase.from('data_access_logs').insert({
    user_id: userId,
    actor_user_id: userId,
    actor_type: 'user',
    action: 'revoke',
    resource_type: 'consent',
    purpose: HEALTH_MEMORY_PURPOSE,
    metadata: {
      source: 'profile',
    },
  });

  if (logError) {
    throw new Error(logError.message);
  }

  await insertHealthMemoryLog(userId, {
    action: 'revoke',
    metadata: {
      purpose: HEALTH_MEMORY_PURPOSE,
      source: 'profile',
    },
    status: 'success',
  });
}

export async function exportHealthDataSnapshot(): Promise<HealthDataSnapshot> {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('ต้อง login ก่อน export ข้อมูลสุขภาพ');
  }

  const [{ data: consents, error: consentsError }, facts] = await Promise.all([
    supabase
      .from('consents')
      .select('purpose,status,version,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    listConfirmedHealthFacts(),
  ]);

  if (consentsError) {
    throw new Error(consentsError.message);
  }

  const snapshot = {
    consents: ((consents as ConsentSnapshotRow[]) ?? []).map((row) => ({
      createdAt: row.created_at,
      purpose: row.purpose,
      status: row.status,
      version: row.version,
    })),
    facts,
    exportedAt: new Date().toISOString(),
  };

  const { error: logError } = await supabase.from('data_access_logs').insert({
    user_id: userId,
    actor_user_id: userId,
    actor_type: 'user',
    action: 'export',
    resource_type: 'health_data_snapshot',
    purpose: HEALTH_MEMORY_PURPOSE,
    metadata: {
      fact_count: facts.length,
    },
  });

  if (logError) {
    throw new Error(logError.message);
  }

  await insertHealthMemoryLog(userId, {
    action: 'export',
    factCount: facts.length,
    factTypes: facts.map((fact) => fact.factType),
    metadata: {
      exported_at: snapshot.exportedAt,
      source: 'profile',
    },
    status: 'success',
  });

  return snapshot;
}

export async function persistConfirmedHealthFacts({
  assistantAnswer,
  facts,
  model,
  question,
  ragChunkIds,
}: {
  assistantAnswer?: string;
  facts: ExtractedHealthFact[];
  model?: string;
  question: string;
  ragChunkIds: string[];
}): Promise<PersistHealthFactsResult> {
  if (facts.length === 0) {
    return { reason: 'no_facts', savedCount: 0, status: 'skipped' };
  }

  if (!supabaseConfigStatus.isConfigured) {
    return { reason: 'supabase_not_configured', savedCount: 0, status: 'skipped' };
  }

  const userId = await getCurrentUserId();

  if (!userId) {
    return { reason: 'not_authenticated', savedCount: 0, status: 'skipped' };
  }

  const factTypes = uniqueFactTypes(facts);

  await insertHealthMemoryLog(userId, {
    action: 'auto_save',
    factCount: facts.length,
    factTypes,
    metadata: {
      question_chars: question.length,
      rag_chunk_ids: ragChunkIds,
    },
    status: 'started',
  });

  try {
    const consent = await ensureHealthMemoryConsent(userId);
    const sessionId = await createChatSession(userId, question);
    const userMessageId = await createChatMessage({
      content: question,
      role: 'user',
      sessionId,
      userId,
    });

    if (assistantAnswer) {
      await createChatMessage({
        content: assistantAnswer,
        model,
        ragChunkIds,
        role: 'assistant',
        sessionId,
        userId,
      });
    }

    const { data: insertedFacts, error: factsError } = await supabase
      .from('health_facts')
      .insert(facts.map((fact) => toHealthFactRow(fact, userId, consent.id, userMessageId)))
      .select('id');

    if (factsError) {
      throw new Error(factsError.message);
    }

    const savedFacts = (insertedFacts as InsertedId[]) ?? [];

    const { error: sourcesError } = await supabase.from('health_fact_sources').insert(
      savedFacts.map((savedFact, index) => ({
        user_id: userId,
        health_fact_id: savedFact.id,
        chat_message_id: userMessageId,
        source_type: 'chat_message',
        evidence_quote: facts[index]?.evidenceQuote,
      })),
    );

    if (sourcesError) {
      throw new Error(sourcesError.message);
    }

    await createAuditLogs(userId, savedFacts);
    await insertHealthMemoryLog(userId, {
      action: 'auto_save',
      factCount: savedFacts.length,
      factTypes,
      metadata: {
        fact_ids: savedFacts.map((fact) => fact.id),
        rag_chunk_ids: ragChunkIds,
        session_id: sessionId,
      },
      status: 'success',
    });

    return {
      savedCount: savedFacts.length,
      status: 'saved',
    };
  } catch (error) {
    await insertHealthMemoryLog(userId, {
      action: 'auto_save',
      factCount: facts.length,
      factTypes,
      metadata: {
        error_message: error instanceof Error ? error.message : 'Unable to save health facts.',
      },
      status: 'error',
    });

    throw error;
  }
}

export function getHealthFactTypeLabel(factType: HealthFactType) {
  const labels: Record<HealthFactType, string> = {
    allergy: 'แพ้ยา/แพ้อาหาร',
    blood_type: 'กรุ๊ปเลือด',
    condition: 'โรคหรือภาวะสุขภาพ',
    demographic: 'ข้อมูลพื้นฐานสุขภาพ',
    family_history: 'ประวัติครอบครัว',
    hospitalization: 'ประวัตินอนโรงพยาบาล',
    immunization: 'วัคซีน',
    lab_result: 'ผลตรวจ',
    lifestyle: 'พฤติกรรมสุขภาพ',
    medication: 'ยา',
    other: 'ข้อมูลสุขภาพอื่น',
    pregnancy: 'การตั้งครรภ์',
    screening: 'ประวัติตรวจคัดกรอง',
    surgery: 'ประวัติผ่าตัด',
    symptom: 'อาการ',
    vital: 'ค่าสุขภาพ',
  };

  return labels[factType];
}
