import { insertRow, resolveAuthUserId, selectMany, selectOne, updateRows } from '../_shared/db.ts';
import { HttpError, handleOptions, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { pushLineMessages, textLineMessage } from '../_shared/line.ts';
import { normalizePaymentSlipPath, transition } from '../_shared/orders.ts';
import { createSignedReadUrl } from '../_shared/storage.ts';
import { orderSystemNoticeForStatus } from '../_shared/templates.ts';
import type { AdminOrderActionRequest, AdminSlipUrlResponse, ChatMessageRow, OrderRow, OrderStatus } from '../_shared/types.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const requestSchema = z.object({
  action: z.enum(['confirm', 'book', 'done', 'cancel', 'note', 'slip_url']),
  booking_at: z.string().optional(),
  note: z.string().optional(),
  order_id: z.string().uuid(),
});

type Embedded<T> = T | T[] | null;

type OrderNotificationRow = Pick<OrderRow, 'channel' | 'customer_id' | 'id' | 'session_id' | 'tenant_id'> & {
  customers: Embedded<{
    line_user_id: string | null;
  }>;
  products: Embedded<{
    name: string | null;
  }>;
  branches: Embedded<{
    name: string | null;
  }>;
  tenants: Embedded<{
    slug: string;
  }>;
};

type LinePushResult =
  | {
      attempted: false;
      reason: string;
    }
  | {
      attempted: true;
      ok: boolean;
      reason?: string;
    };

function embeddedOne<T>(value: Embedded<T>) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

type StatusAction = Extract<AdminOrderActionRequest, { action: 'book' | 'cancel' | 'confirm' | 'done' }>['action'];

function actionToStatus(action: StatusAction): OrderStatus {
  if (action === 'confirm') {
    return 'confirmed';
  }

  if (action === 'book') {
    return 'booked';
  }

  if (action === 'done') {
    return 'done';
  }

  return 'cancelled';
}

async function signedSlipUrl(order: Pick<OrderRow, 'slip_url'>): Promise<AdminSlipUrlResponse> {
  if (!order.slip_url) {
    return {
      expires_in: 60 * 60,
      signed_url: null,
      storage_path: null,
    };
  }

  if (order.slip_url.startsWith('http')) {
    return {
      expires_in: 60 * 60,
      signed_url: order.slip_url,
      storage_path: null,
    };
  }

  const storagePath = normalizePaymentSlipPath(order.slip_url);

  return {
    expires_in: 60 * 60,
    signed_url: await createSignedReadUrl('payment-slips', storagePath, 60 * 60),
    storage_path: storagePath,
  };
}

async function loadOrderNotification(orderId: string, tenantId: string) {
  return selectOne<OrderNotificationRow>('orders', {
    id: `eq.${orderId}`,
    select: 'id,tenant_id,customer_id,session_id,channel,tenants(slug),customers(line_user_id),products(name),branches(name)',
    tenant_id: `eq.${tenantId}`,
  });
}

async function persistSystemNotice(sessionId: string, text: string) {
  return insertRow<ChatMessageRow>('chat_messages', {
    content: text,
    role: 'system_notice',
    session_id: sessionId,
  }, {
    select: 'id,session_id,role,content,marker_product_ids,openai_response_id,client_msg_id,created_at',
  });
}

async function pushLineOrderNotice(order: OrderNotificationRow | null, status: OrderStatus, noticeText: string | null): Promise<LinePushResult> {
  if (status !== 'confirmed' && status !== 'booked') {
    return {
      attempted: false,
      reason: 'status_not_pushable',
    };
  }

  if (!order || order.channel !== 'chat_line' || !order.session_id) {
    return {
      attempted: false,
      reason: 'not_line_order',
    };
  }

  const tenant = embeddedOne(order.tenants);
  const customer = embeddedOne(order.customers);

  if (!tenant?.slug || !customer?.line_user_id) {
    return {
      attempted: false,
      reason: 'missing_line_target',
    };
  }

  if (!noticeText) {
    return {
      attempted: false,
      reason: 'missing_notice_text',
    };
  }

  try {
    await pushLineMessages(tenant.slug, customer.line_user_id, [textLineMessage(noticeText)]);

    return {
      attempted: true,
      ok: true,
    };
  } catch (error) {
    console.error('line_push_failed', {
      error: error instanceof Error ? error.message : String(error),
      order_id: order.id,
      status,
      tenant_slug: tenant.slug,
    });

    return {
      attempted: true,
      ok: false,
      reason: error instanceof Error ? error.message : 'LINE push failed.',
    };
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
    const body = await validateJson(req, requestSchema);
    const authUserId = await resolveAuthUserId(req.headers.get('authorization'));
    const memberships = await selectMany<{ role: string; tenant_id: string }>('tenant_members', {
      auth_user_id: `eq.${authUserId}`,
      select: 'tenant_id,role',
    });

    if (memberships.length === 0) {
      throw new HttpError('VALIDATION', 'Not allowed for this tenant.', 403);
    }

    const membershipByTenant = new Map(memberships.map((membership) => [membership.tenant_id, membership.role]));
    const tenantFilter = memberships.map((membership) => membership.tenant_id).join(',');
    const order = await selectOne<OrderRow>('orders', {
      id: `eq.${body.order_id}`,
      select:
        'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,branch_id,buyer_age,admin_note,created_at,updated_at',
      tenant_id: `in.(${tenantFilter})`,
    });

    if (!order) {
      throw new HttpError('VALIDATION', 'Order not found.', 404);
    }

    const role = membershipByTenant.get(order.tenant_id);

    if (role !== 'superadmin' && role !== 'tenant_admin' && role !== 'tenant_staff') {
      throw new HttpError('VALIDATION', 'Not allowed for this tenant.', 403);
    }

    if (body.action === 'slip_url') {
      return json(await signedSlipUrl(order));
    }

    if (body.action === 'note') {
      const note = body.note?.trim();

      if (!note) {
        throw new HttpError('VALIDATION', 'note is required to update an internal note.', 400);
      }

      const rows = await updateRows<OrderRow>(
        'orders',
        {
          admin_note: note,
          updated_at: new Date().toISOString(),
        },
        {
          id: `eq.${order.id}`,
          select:
            'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,branch_id,buyer_age,admin_note,created_at,updated_at',
          tenant_id: `eq.${order.tenant_id}`,
        },
      );
      const updatedOrder = rows[0];

      if (!updatedOrder) {
        throw new HttpError('VALIDATION', 'Order not found.', 404);
      }

      return json({ order: updatedOrder });
    }

    if (body.action === 'book' && !body.booking_at) {
      throw new HttpError('VALIDATION', 'booking_at is required to book an order.', 400);
    }

    if (body.booking_at || body.note) {
      await updateRows<OrderRow>(
        'orders',
        {
          ...(body.booking_at ? { booking_at: body.booking_at } : {}),
          ...(body.note ? { admin_note: body.note } : {}),
          updated_at: new Date().toISOString(),
        },
        {
          id: `eq.${order.id}`,
          select:
            'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,branch_id,buyer_age,admin_note,created_at,updated_at',
          tenant_id: `eq.${order.tenant_id}`,
        },
      );
    }

    const targetStatus = actionToStatus(body.action);
    const updatedOrder = await transition(order.id, targetStatus, `admin:${authUserId}`, {
      action: body.action,
      note: body.note ?? null,
    });
    const notificationOrder = await loadOrderNotification(order.id, order.tenant_id);
    const productName = embeddedOne(notificationOrder?.products ?? null)?.name ?? null;
    const branchName = embeddedOne(notificationOrder?.branches ?? null)?.name ?? null;
    const didTransition = order.status !== updatedOrder.status;
    const noticeText = didTransition ? orderSystemNoticeForStatus(updatedOrder.status, productName, updatedOrder.booking_at, branchName) : null;

    if (noticeText && notificationOrder?.session_id) {
      await persistSystemNotice(notificationOrder.session_id, noticeText);
    }

    const linePush = didTransition
      ? await pushLineOrderNotice(notificationOrder, updatedOrder.status, noticeText)
      : { attempted: false, reason: 'transition_noop' };

    return json({ line_push: linePush, order: updatedOrder });
  } catch (error) {
    return toErrorResponse(error);
  }
});
