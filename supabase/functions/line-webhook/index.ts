import QRCode from 'qrcode';

import { assertTenant, insertRow, rest } from '../_shared/db.ts';
import { HttpError, handleOptions, json, toErrorResponse } from '../_shared/http.ts';
import {
  branchSelectionLineFlexMessage,
  categoryLineFlexMessage,
  linePostbackToAction,
  orderPaymentLineFlexMessage,
  orderQrLineImageMessage,
  productLineFlexMessage,
  replyLineMessages,
  startLineLoading,
  textLineMessage,
  verifyLineSignature,
  type LineMessage,
} from '../_shared/line.ts';
import { orchestrateLine } from '../_shared/orchestrate.ts';
import { uploadStorageObject } from '../_shared/storage.ts';
import type { ChatOrchestratorResponse, OrderPanelState } from '../_shared/types.ts';

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type LineEvent = {
  deliveryContext?: {
    isRedelivery?: boolean;
  };
  message?: {
    id?: string;
    text?: string;
    type?: string;
  };
  postback?: {
    data?: string;
  };
  replyToken?: string;
  source?: {
    userId?: string;
  };
  type?: string;
  webhookEventId?: string;
};

type LineWebhookBody = {
  events?: LineEvent[];
};

function envOrDefault(key: string, fallback: string) {
  return Deno.env.get(key)?.trim() || fallback;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function orderLineMessages(order: NonNullable<OrderPanelState>): Promise<LineMessage[]> {
  if (!order.qr_payload) {
    return [];
  }

  const dataUrl = await QRCode.toDataURL(order.qr_payload, {
    margin: 1,
    scale: 8,
    type: 'image/png',
  });
  const qrBytes = base64ToBytes(dataUrl.split(',')[1] ?? '');
  const qrUrl = await uploadStorageObject('line-assets', `promptpay/${order.id}.png`, qrBytes, 'image/png');

  return [
    orderQrLineImageMessage(qrUrl),
    orderPaymentLineFlexMessage(order),
  ];
}

async function toLineMessages(response: ChatOrchestratorResponse) {
  const messages: LineMessage[] = [textLineMessage(response.text)];
  const products = productLineFlexMessage(response.products);

  if (products) {
    messages.push(products);
  }

  const order = response.order;

  if (order) {
    if (order.step === 'branch') {
      const branchMessage = branchSelectionLineFlexMessage(order);

      if (branchMessage) {
        messages.push(branchMessage);
      }
    } else {
      messages.push(...await orderLineMessages(order));
    }
  }

  for (const card of response.cards) {
    if (card.type === 'category_grid') {
      const categories = categoryLineFlexMessage(card.categories);

      if (categories) {
        messages.push(categories);
      }
    }
  }

  return messages.slice(0, 5);
}

async function handleEvent(event: LineEvent, tenantSlug: string) {
  // Idempotency (V3-5): LINE re-delivers events when the webhook is slow to ack.
  // Reprocessing a redelivered postback creates duplicate orders, so skip them.
  if (event.deliveryContext?.isRedelivery) {
    return;
  }

  const replyToken = event.replyToken;
  const lineUserId = event.source?.userId;

  if (!replyToken || !lineUserId) {
    return;
  }

  // Show the LINE typing/loading animation right away so button taps feel
  // responsive while the model runs (best-effort — must not block the turn).
  try {
    await startLineLoading(tenantSlug, lineUserId);
  } catch (error) {
    console.warn('line_loading_failed', error);
  }

  if (event.type === 'message' && event.message?.type === 'text' && event.message.text) {
    const response = await orchestrateLine({
      action: null,
      client_msg_id: event.message.id ?? crypto.randomUUID(),
      line_user_id: lineUserId,
      message: event.message.text,
      tenant_slug: tenantSlug,
    });

    if (!response) {
      return;
    }

    await replyLineMessages(replyToken, await toLineMessages(response), tenantSlug);
    return;
  }

  if (event.type === 'postback') {
    const parsed = linePostbackToAction(event.postback?.data);
    const response = await orchestrateLine({
      action: parsed.action,
      client_msg_id: crypto.randomUUID(),
      line_user_id: lineUserId,
      message: parsed.message,
      tenant_slug: tenantSlug,
    });

    if (!response) {
      return;
    }

    await replyLineMessages(replyToken, await toLineMessages(response), tenantSlug);
    return;
  }

  if (event.type === 'follow') {
    const response = await orchestrateLine({
      action: null,
      client_msg_id: crypto.randomUUID(),
      line_user_id: lineUserId,
      message: 'สวัสดี',
      tenant_slug: tenantSlug,
    });

    if (!response) {
      return;
    }

    await replyLineMessages(replyToken, await toLineMessages(response), tenantSlug);
  }
}

// H2: claim an event by its globally-unique webhookEventId before any side
// effect. Returns false when the event was already processed (LINE redelivery),
// so the caller skips it. Events without an id (older API / edge cases) are not
// deduped — they fall back to the previous always-process behaviour.
async function claimLineEvent(eventId: string | undefined, tenantId: string): Promise<boolean> {
  if (!eventId) {
    return true;
  }

  try {
    await insertRow('line_webhook_events', { event_id: eventId, tenant_id: tenantId });
    return true;
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      return false;
    }

    throw error;
  }
}

// Releases a claim so a failed event can be retried by a later redelivery.
// Best-effort: a failed release just means that event won't retry (at-most-once).
async function releaseLineEvent(eventId: string | undefined) {
  if (!eventId) {
    return;
  }

  try {
    await rest(`line_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });
  } catch (error) {
    console.warn('line_event_release_failed', error instanceof Error ? error.message : error);
  }
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);

  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== 'POST') {
    return toErrorResponse(new HttpError('VALIDATION', 'Method not allowed.', 405));
  }

  try {
    const bodyText = await req.text();
    const tenantSlug = new URL(req.url).searchParams.get('tenant') ?? envOrDefault('MIRA_DEFAULT_TENANT_SLUG', 'demo-hospital');
    await verifyLineSignature(bodyText, req.headers.get('x-line-signature'), tenantSlug);
    const payload = JSON.parse(bodyText) as LineWebhookBody;
    const tenant = await assertTenant(tenantSlug);
    let processed = 0;
    let skipped = 0;

    // M1: isolate each event so one failure (or a slow OpenAI call) cannot abort
    // the whole batch and force LINE to redeliver every event.
    for (const event of payload.events ?? []) {
      const claimed = await claimLineEvent(event.webhookEventId, tenant.id);

      if (!claimed) {
        skipped += 1;
        continue;
      }

      try {
        await handleEvent(event, tenantSlug);
        processed += 1;
      } catch (error) {
        console.error('line_event_failed', {
          error: error instanceof Error ? error.message : String(error),
          type: event.type,
          webhookEventId: event.webhookEventId ?? null,
        });
        await releaseLineEvent(event.webhookEventId);
      }
    }

    return json({
      ok: true,
      processed,
      skipped,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
});
