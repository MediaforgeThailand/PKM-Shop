// PKM-Shop — the single notification fan-out (Ready.md §4, §6). Every event, customer- and
// staff-side, is logged to `notifications` and pushed over the one LINE OA (best-effort).
// Producers (slip-verify, round-lock, packing, rider, payroll…) POST to the `notify` edge
// function, which calls notifyEvent() here.

import { insertRow, selectMany, selectOne, updateRows } from './db.ts';
import { HttpError } from './http.ts';
import { pushLineMessages, textLineMessage, type LineMessage } from './line.ts';
import { roundLabelBangkok } from './rounds.ts';
import { customerText, staffText, type NotifyEvent, type TemplateCtx } from './pkmTemplates.ts';

type OrderForNotify = {
  id: string;
  order_no: string;
  customer_id: string;
  round_id: string | null;
  grand_total: number;
  delivery_fee: number;
  delivery_type: string;
  cancelled_reason: string | null;
  external_ref: string | null;
  customers: { line_user_id: string | null; nickname: string | null } | null;
};

type StaffProfile = { id: string; line_user_id: string | null; roles: string[] };

const ORDER_SELECT =
  'id,order_no,customer_id,round_id,grand_total,delivery_fee,delivery_type,cancelled_reason,external_ref,customers(line_user_id,nickname)';

function nowIso() {
  return new Date().toISOString();
}

async function loadOrder(orderId: string, tenantId: string): Promise<OrderForNotify | null> {
  return selectOne<OrderForNotify>('orders', {
    id: `eq.${orderId}`,
    select: ORDER_SELECT,
    tenant_id: `eq.${tenantId}`,
  });
}

async function roundLabelFor(roundId: string | null): Promise<string | undefined> {
  if (!roundId) return undefined;
  const round = await selectOne<{ round_at: string }>('delivery_rounds', {
    id: `eq.${roundId}`,
    select: 'round_at',
  });
  return round ? roundLabelBangkok(new Date(round.round_at)) : undefined;
}

async function staffByRoles(tenantId: string, roles: string[]): Promise<StaffProfile[]> {
  const rows = await selectMany<StaffProfile>('profiles', {
    active: 'eq.true',
    line_user_id: 'not.is.null',
    select: 'id,line_user_id,roles',
    tenant_id: `eq.${tenantId}`,
  });
  return rows.filter((p) => Array.isArray(p.roles) && p.roles.some((r) => roles.includes(r)));
}

// Log one notification + push it (best-effort). Deduped by dedup_key so retries/redeliveries
// never double-send. A missing LINE user id is logged as 'skipped' (still auditable).
async function sendOne(params: {
  tenantSlug: string;
  tenantId: string;
  eventType: NotifyEvent;
  audience: 'customer' | 'staff';
  lineUserId: string | null;
  body: string;
  dedupKey: string;
  orderId?: string;
  roundId?: string;
  recipientCustomerId?: string;
  recipientProfileId?: string;
  photoUrl?: string | null;
}): Promise<void> {
  let notifId: string | null = null;
  try {
    const row = await insertRow<{ id: string }>(
      'notifications',
      {
        audience: params.audience,
        body: params.body,
        dedup_key: params.dedupKey,
        event_type: params.eventType,
        order_id: params.orderId ?? null,
        recipient_customer_id: params.recipientCustomerId ?? null,
        recipient_line_user_id: params.lineUserId,
        recipient_profile_id: params.recipientProfileId ?? null,
        round_id: params.roundId ?? null,
        status: params.lineUserId ? 'pending' : 'skipped',
        tenant_id: params.tenantId,
      },
      { select: 'id' },
    );
    notifId = row?.id ?? null;
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      // Row already exists (dedup). Re-drive delivery if the earlier attempt never reached LINE
      // (status pending/failed) — otherwise a transient push failure would be lost forever.
      const existing = await selectOne<{ id: string; status: string }>('notifications', {
        tenant_id: `eq.${params.tenantId}`, dedup_key: `eq.${params.dedupKey}`, select: 'id,status', limit: '1',
      }).catch(() => null);
      if (existing && existing.status !== 'sent' && params.lineUserId) {
        notifId = existing.id; // fall through to (re)push below
      } else {
        return;
      }
    } else {
      console.warn('notify_insert_failed', error instanceof Error ? error.message : error);
      return;
    }
  }

  if (!params.lineUserId || !notifId) {
    return;
  }

  try {
    const messages: LineMessage[] = [];
    if (params.photoUrl) {
      messages.push({ type: 'image', originalContentUrl: params.photoUrl, previewImageUrl: params.photoUrl });
    }
    messages.push(textLineMessage(params.body));
    await pushLineMessages(params.tenantSlug, params.lineUserId, messages);
    await updateRows('notifications', { sent_at: nowIso(), status: 'sent' }, { id: `eq.${notifId}` });
  } catch (error) {
    await updateRows(
      'notifications',
      { error: error instanceof Error ? error.message : String(error), status: 'failed' },
      { id: `eq.${notifId}` },
    ).catch(() => {});
  }
}

export type NotifyParams = {
  tenantSlug: string;
  tenantId: string;
  eventType: NotifyEvent;
  orderId?: string;
  roundId?: string;
  extra?: TemplateCtx & { photoUrl?: string | null; profileId?: string; session_key?: string };
};

// Fan an event out to the right customer(s) and/or staff.
export async function notifyEvent(params: NotifyParams): Promise<void> {
  const { tenantSlug, tenantId, eventType, orderId, roundId, extra = {} } = params;
  const dayKey = new Date().toISOString().slice(0, 10); // discriminate recurring payroll/payouts

  const order = orderId ? await loadOrder(orderId, tenantId) : null;
  const roundLabel = extra.round_label ?? (order ? await roundLabelFor(order.round_id) : await roundLabelFor(roundId ?? null));

  const baseCtx: TemplateCtx = {
    amount: extra.amount ?? order?.grand_total,
    count: extra.count,
    fee: extra.fee ?? order?.delivery_fee,
    order_no: extra.order_no ?? order?.order_no,
    reason: extra.reason ?? order?.cancelled_reason ?? undefined,
    round_label: roundLabel,
    total: extra.total,
    tracking: extra.tracking ?? order?.external_ref ?? undefined,
  };

  const dedup = (suffix: string) => `${eventType}:${orderId ?? roundId ?? 'x'}:${suffix}`;

  // --- customer-facing single-order events ---
  const customerFn = customerText[eventType];
  if (customerFn && order) {
    await sendOne({
      audience: 'customer',
      body: customerFn(baseCtx),
      dedupKey: dedup(order.customer_id),
      eventType,
      lineUserId: order.customers?.line_user_id ?? null,
      orderId: order.id,
      photoUrl: extra.photoUrl,
      recipientCustomerId: order.customer_id,
      tenantId,
      tenantSlug,
    });
  }

  switch (eventType) {
    case 'rider_accepted': {
      // every customer in the round
      const orders = roundId
        ? await selectMany<OrderForNotify>('orders', { round_id: `eq.${roundId}`, select: ORDER_SELECT, tenant_id: `eq.${tenantId}` })
        : [];
      const fn = customerText.rider_accepted!;
      for (const o of orders) {
        await sendOne({
          audience: 'customer',
          body: fn({ ...baseCtx, order_no: o.order_no }),
          dedupKey: `rider_accepted:${roundId}:${o.customer_id}`,
          eventType,
          lineUserId: o.customers?.line_user_id ?? null,
          orderId: o.id,
          recipientCustomerId: o.customer_id,
          roundId: roundId,
          tenantId,
          tenantSlug,
        });
      }
      break;
    }
    case 'round_locked': {
      const count = roundId
        ? (await selectMany<{ id: string }>('orders', { round_id: `eq.${roundId}`, select: 'id', tenant_id: `eq.${tenantId}` })).length
        : 0;
      const packers = await staffByRoles(tenantId, ['packer', 'admin']);
      const riders = await staffByRoles(tenantId, ['rider', 'admin']);
      for (const p of packers) {
        await sendOne({ audience: 'staff', body: staffText['round_locked:packer']!({ ...baseCtx, count }), dedupKey: `round_locked_pk:${roundId}:${p.id}`, eventType, lineUserId: p.line_user_id, recipientProfileId: p.id, roundId, tenantId, tenantSlug });
      }
      for (const r of riders) {
        await sendOne({ audience: 'staff', body: staffText['round_locked:rider']!({ ...baseCtx, count }), dedupKey: `round_locked_rd:${roundId}:${r.id}`, eventType, lineUserId: r.line_user_id, recipientProfileId: r.id, roundId, tenantId, tenantSlug });
      }
      break;
    }
    case 'express_paid': {
      const staff = await staffByRoles(tenantId, ['packer', 'admin']);
      for (const s of staff) {
        await sendOne({ audience: 'staff', body: staffText['express_paid']!(baseCtx), dedupKey: `express_paid:${orderId}:${s.id}`, eventType, lineUserId: s.line_user_id, orderId, recipientProfileId: s.id, tenantId, tenantSlug });
      }
      break;
    }
    case 'returned': {
      const admins = await staffByRoles(tenantId, ['admin']);
      for (const a of admins) {
        await sendOne({ audience: 'staff', body: staffText['returned_admin']!(baseCtx), dedupKey: `returned_admin:${orderId}:${a.id}`, eventType, lineUserId: a.line_user_id, orderId, recipientProfileId: a.id, tenantId, tenantSlug });
      }
      break;
    }
    case 'payroll_cutoff': {
      const admins = await staffByRoles(tenantId, ['admin']);
      for (const a of admins) {
        await sendOne({ audience: 'staff', body: staffText['payroll_admin']!(baseCtx), dedupKey: `payroll_admin:${dayKey}:${a.id}`, eventType, lineUserId: a.line_user_id, recipientProfileId: a.id, tenantId, tenantSlug });
      }
      break;
    }
    case 'payout_confirmed': {
      if (extra.profileId) {
        const p = await selectOne<StaffProfile>('profiles', { id: `eq.${extra.profileId}`, select: 'id,line_user_id,roles', tenant_id: `eq.${tenantId}` });
        if (p) {
          await sendOne({ audience: 'staff', body: staffText['payout_confirmed']!(baseCtx), dedupKey: `payout:${extra.profileId}:${dayKey}:${extra.amount ?? 0}`, eventType, lineUserId: p.line_user_id, recipientProfileId: p.id, tenantId, tenantSlug });
        }
      }
      break;
    }
    case 'payroll_self': {
      // Each rider/packer gets their own weekly total (Ready.md §6 ยอดของฉันรอบนี้).
      if (extra.profileId) {
        const p = await selectOne<StaffProfile>('profiles', { id: `eq.${extra.profileId}`, select: 'id,line_user_id,roles', tenant_id: `eq.${tenantId}` });
        if (p) {
          await sendOne({ audience: 'staff', body: staffText['payroll_self']!(baseCtx), dedupKey: `payroll_self:${dayKey}:${extra.profileId}`, eventType, lineUserId: p.line_user_id, recipientProfileId: p.id, tenantId, tenantSlug });
        }
      }
      break;
    }
    case 'slip_manual_queue': {
      // A new manual-queue entry should alert admins every time (no cross-slip dedup).
      const admins = await staffByRoles(tenantId, ['admin']);
      const unique = crypto.randomUUID();
      for (const a of admins) {
        await sendOne({ audience: 'staff', body: staffText['slip_manual_queue']!(baseCtx), dedupKey: `slipq:${orderId}:${unique}:${a.id}`, eventType, lineUserId: a.line_user_id, orderId, recipientProfileId: a.id, tenantId, tenantSlug });
      }
      break;
    }
    case 'slipok_quota': {
      // Urgent, but rate-limited to once per hour so a burst of slips doesn't spam admins.
      const hourKey = new Date().toISOString().slice(0, 13);
      const admins = await staffByRoles(tenantId, ['admin']);
      for (const a of admins) {
        await sendOne({ audience: 'staff', body: staffText['slipok_quota']!(baseCtx), dedupKey: `slipok_quota:${hourKey}:${a.id}`, eventType, lineUserId: a.line_user_id, recipientProfileId: a.id, tenantId, tenantSlug });
      }
      break;
    }
    case 'handoff': {
      const admins = await staffByRoles(tenantId, ['admin']);
      for (const a of admins) {
        await sendOne({ audience: 'staff', body: staffText['handoff']!(baseCtx), dedupKey: `handoff:${extra.session_key ?? orderId ?? 'x'}:${a.id}`, eventType, lineUserId: a.line_user_id, recipientProfileId: a.id, tenantId, tenantSlug });
      }
      break;
    }
    default:
      break;
  }
}
