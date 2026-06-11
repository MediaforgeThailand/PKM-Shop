import { callFactExtractor } from '../_shared/openai.ts';
import { selectOne } from '../_shared/db.ts';
import { insertFactsIdempotent, loadFactRegistry, normalizeFactCandidates, type ExtractedFactCandidate } from '../_shared/facts.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { assertInternalServiceRoleAuthorization } from '../_shared/internalAuth.ts';
import type { ChatMessageRow, ChatSessionRow, CustomerRow } from '../_shared/types.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const requestSchema = z.object({
  message_id: z.string().uuid(),
});

function parseFactPayload(value: unknown): ExtractedFactCandidate[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const facts = (value as { facts?: unknown }).facts;

  if (!Array.isArray(facts)) {
    return [];
  }

  return facts
    .map((fact): ExtractedFactCandidate | null => {
      if (!fact || typeof fact !== 'object') {
        return null;
      }

      const candidate = fact as Record<string, unknown>;

      if (typeof candidate.key !== 'string' || typeof candidate.value !== 'string' || typeof candidate.confidence !== 'number') {
        return null;
      }

      return {
        confidence: candidate.confidence,
        key: candidate.key,
        value: candidate.value,
      };
    })
    .filter((fact): fact is ExtractedFactCandidate => Boolean(fact));
}

export async function handleFactExtractor(req: Request) {
  const optionsResponse = handleOptions(req);

  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== 'POST') {
    return toErrorResponse(new HttpError('VALIDATION', 'Method not allowed.', 405));
  }

  try {
    assertInternalServiceRoleAuthorization(req.headers.get('authorization'));

    const body = await validateJson(req, requestSchema);
    const message = await selectOne<ChatMessageRow>('chat_messages', {
      id: `eq.${body.message_id}`,
      role: 'eq.user',
      select: 'id,session_id,role,content,marker_product_ids,openai_response_id,client_msg_id,created_at',
    });

    if (!message) {
      return json({ extracted: 0 });
    }

    const session = await selectOne<ChatSessionRow>('chat_sessions', {
      id: `eq.${message.session_id}`,
      select: 'id,tenant_id,customer_id,channel,flagged,last_message_at,created_at',
    });

    if (!session) {
      return json({ extracted: 0 });
    }

    const latestConsent = await selectOne<{ granted: boolean }>('consents', {
      customer_id: `eq.${session.customer_id}`,
      kind: 'eq.health_data_collection',
      order: 'created_at.desc',
      select: 'granted',
      tenant_id: `eq.${session.tenant_id}`,
    });

    if (!latestConsent?.granted) {
      return json({ extracted: 0 });
    }

    const customer = await selectOne<CustomerRow>('customers', {
      id: `eq.${session.customer_id}`,
      select: 'id,tenant_id,auth_user_id,line_user_id,nickname,phone,referred_by,referred_at,created_at',
      tenant_id: `eq.${session.tenant_id}`,
    });

    if (!customer) {
      return json({ extracted: 0 });
    }

    const registry = await loadFactRegistry();
    const payload = await callFactExtractor(message.content, registry);
    const facts = normalizeFactCandidates(parseFactPayload(payload), registry);
    const inserted = await insertFactsIdempotent({
      customerId: customer.id,
      facts,
      sourceRef: message.id,
      tenantId: session.tenant_id,
    });

    return json({ extracted: inserted.length });
  } catch (error) {
    console.warn('fact_extractor_failed', error instanceof Error ? error.message : error);

    return toErrorResponse(error);
  }
}

if (!(globalThis as typeof globalThis & { __MIRACARE_SUPPRESS_SERVE__?: boolean }).__MIRACARE_SUPPRESS_SERVE__) {
  Deno.serve(handleFactExtractor);
}
