// PKM-Shop — LINE OA webhook (Ready.md §7). Verifies signature, dedups events, and routes
// inbound message/postback/follow/location/image to the AI sales agent. Renders replies as
// text + Flex cards + PromptPay QR image.
import QRCode from 'qrcode';

import { assertTenant, insertRow, rest } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse } from '../_shared/http.ts';
import {
  replyLineMessages,
  requireLineChannelToken,
  startLineLoading,
  textLineMessage,
  verifyLineSignature,
  type LineMessage,
} from '../_shared/line.ts';
import { categoryFlex, deliveryOptionsFlex, paymentFlex, pkmPostbackToAction, productFlex } from '../_shared/pkmLine.ts';
import { bindStaffLinkCode, handleLineSlip, orchestrateLine } from '../_shared/pkmOrchestrate.ts';
import { uploadStorageObject } from '../_shared/storage.ts';
import type { PkmChatResponse } from '../_shared/pkmTypes.ts';

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type LineEvent = {
  deliveryContext?: { isRedelivery?: boolean };
  message?: { id?: string; text?: string; type?: string; latitude?: number; longitude?: number; address?: string; title?: string };
  postback?: { data?: string };
  replyToken?: string;
  source?: { userId?: string };
  type?: string;
  webhookEventId?: string;
};

function envOrDefault(key: string, fallback: string) {
  return Deno.env.get(key)?.trim() || fallback;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function toLineMessages(response: PkmChatResponse): Promise<LineMessage[]> {
  const messages: LineMessage[] = [];
  if (response.text?.trim()) {
    messages.push(textLineMessage(response.text));
  }
  for (const card of response.cards) {
    if (card.type === 'product_grid') {
      const flex = productFlex(card.products);
      if (flex) messages.push(flex);
    } else if (card.type === 'category_grid') {
      const flex = categoryFlex(card.categories);
      if (flex) messages.push(flex);
    } else if (card.type === 'delivery_options') {
      const flex = deliveryOptionsFlex(card.order_id, card.options);
      if (flex) messages.push(flex);
    }
  }
  const order = response.order;
  if (order?.qr_payload) {
    const dataUrl = await QRCode.toDataURL(order.qr_payload, { margin: 1, scale: 8, type: 'image/png' });
    const bytes = base64ToBytes(dataUrl.split(',')[1] ?? '');
    const qrUrl = await uploadStorageObject('line-assets', `promptpay/${order.id}.png`, bytes, 'image/png');
    messages.push({ originalContentUrl: qrUrl, previewImageUrl: qrUrl, type: 'image' });
    messages.push(paymentFlex(order));
  }
  return messages.slice(0, 5);
}

async function downloadLineImage(tenantSlug: string, messageId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const token = requireLineChannelToken(tenantSlug);
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new HttpError('UPSTREAM', `LINE content fetch failed ${response.status}.`, 502);
  }
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'image/jpeg' };
}

async function handleEvent(event: LineEvent, tenantSlug: string) {
  if (event.deliveryContext?.isRedelivery) {
    return;
  }
  const replyToken = event.replyToken;
  const lineUserId = event.source?.userId;
  if (!replyToken || !lineUserId) {
    return;
  }
  try {
    await startLineLoading(tenantSlug, lineUserId);
  } catch (error) {
    console.warn('line_loading_failed', error);
  }

  // Slip image → verify (no model turn).
  if (event.type === 'message' && event.message?.type === 'image' && event.message.id) {
    const image = await downloadLineImage(tenantSlug, event.message.id);
    const reply = await handleLineSlip(tenantSlug, lineUserId, image.bytes, image.contentType);
    await replyLineMessages(replyToken, [textLineMessage(reply)], tenantSlug);
    return;
  }

  // Shared-location message → set address.
  if (event.type === 'message' && event.message?.type === 'location') {
    const response = await orchestrateLine({
      action: { address_text: event.message.address ?? event.message.title, lat: event.message.latitude, lng: event.message.longitude, type: 'set_address' },
      client_msg_id: crypto.randomUUID(),
      line_user_id: lineUserId,
      message: 'แจ้งที่อยู่จัดส่ง',
      tenant_slug: tenantSlug,
    });
    if (response) {
      await replyLineMessages(replyToken, await toLineMessages(response), tenantSlug);
    }
    return;
  }

  if (event.type === 'message' && event.message?.type === 'text' && event.message.text) {
    // Staff binding: a 6-char link code from a staff member's profile page.
    const bind = await bindStaffLinkCode(tenantSlug, lineUserId, event.message.text);
    if (bind) {
      await replyLineMessages(replyToken, [textLineMessage(bind)], tenantSlug);
      return;
    }
    const response = await orchestrateLine({ action: null, client_msg_id: event.message.id ?? crypto.randomUUID(), line_user_id: lineUserId, message: event.message.text, tenant_slug: tenantSlug });
    if (response) {
      await replyLineMessages(replyToken, await toLineMessages(response), tenantSlug);
    }
    return;
  }

  if (event.type === 'postback') {
    const parsed = pkmPostbackToAction(event.postback?.data);
    const response = await orchestrateLine({ action: parsed.action, client_msg_id: crypto.randomUUID(), line_user_id: lineUserId, message: parsed.message, tenant_slug: tenantSlug });
    if (response) {
      await replyLineMessages(replyToken, await toLineMessages(response), tenantSlug);
    }
    return;
  }

  if (event.type === 'follow') {
    const response = await orchestrateLine({ action: null, client_msg_id: crypto.randomUUID(), line_user_id: lineUserId, message: 'สวัสดี', tenant_slug: tenantSlug });
    if (response) {
      await replyLineMessages(replyToken, await toLineMessages(response), tenantSlug);
    }
  }
}

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

async function releaseLineEvent(eventId: string | undefined) {
  if (!eventId) {
    return;
  }
  try {
    await rest(`line_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, { method: 'DELETE', prefer: 'return=minimal' });
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
    const tenantSlug = new URL(req.url).searchParams.get('tenant') ?? envOrDefault('PKM_DEFAULT_TENANT_SLUG', 'pkm-shop');
    await verifyLineSignature(bodyText, req.headers.get('x-line-signature'), tenantSlug);
    const payload = JSON.parse(bodyText) as { events?: LineEvent[] };
    const tenant = await assertTenant(tenantSlug);
    let processed = 0;
    let skipped = 0;

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
        console.error('line_event_failed', { error: error instanceof Error ? error.message : String(error), type: event.type });
        await releaseLineEvent(event.webhookEventId);
      }
    }

    return json({ ok: true, processed, skipped });
  } catch (error) {
    return toErrorResponse(error);
  }
});
