import { resolveAuthUserId, selectMany, selectOne, updateRows } from '../_shared/db.ts';
import { HttpError, handleOptions, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { pushLineMessages, textLineMessage } from '../_shared/line.ts';
import { transition } from '../_shared/orders.ts';
import type { AdminOrderActionRequest, OrderRow, OrderStatus } from '../_shared/types.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const requestSchema = z.object({
  action: z.enum(['confirm', 'book', 'done', 'cancel']),
  booking_at: z.string().optional(),
  note: z.string().optional(),
  order_id: z.string().uuid(),
});

type Embedded<T> = T | T[] | null;

type OrderNotificationRow = Pick<OrderRow, 'channel' | 'customer_id' | 'id' | 'session_id' | 'tenant_id'> & {
  customers: Embedded<{
    line_user_id: string | null;
  }>;
  tenants: Embedded<{
    slug: string;
  }>;
};

type LatestNoticeRow = {
  content: string;
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

function actionToStatus(action: AdminOrderActionRequest['action']): OrderStatus {
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

async function pushLineOrderNotice(orderId: string, tenantId: string, status: OrderStatus): Promise<LinePushResult> {
  if (status !== 'confirmed' && status !== 'booked') {
    return {
      attempted: false,
      reason: 'status_not_pushable',
    };
  }

  const order = await selectOne<OrderNotificationRow>('orders', {
    id: `eq.${orderId}`,
    select: 'id,tenant_id,customer_id,session_id,channel,tenants(slug),customers(line_user_id)',
    tenant_id: `eq.${tenantId}`,
  });

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

  const notice = await selectOne<LatestNoticeRow>('chat_messages', {
    order: 'created_at.desc',
    role: 'eq.system_notice',
    select: 'content',
    session_id: `eq.${order.session_id}`,
  });

  if (!notice?.content) {
    return {
      attempted: false,
      reason: 'missing_system_notice',
    };
  }

  try {
    await pushLineMessages(tenant.slug, customer.line_user_id, [textLineMessage(notice.content)]);

    return {
      attempted: true,
      ok: true,
    };
  } catch (error) {
    console.error('line_push_failed', {
      error: error instanceof Error ? error.message : String(error),
      order_id: orderId,
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
        'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,status,slip_url,booking_at,admin_note,created_at,updated_at',
      tenant_id: `in.(${tenantFilter})`,
    });

    if (!order) {
      throw new HttpError('VALIDATION', 'Order not found.', 404);
    }

    const role = membershipByTenant.get(order.tenant_id);

    if (role !== 'superadmin' && role !== 'tenant_admin' && role !== 'tenant_staff') {
      throw new HttpError('VALIDATION', 'Not allowed for this tenant.', 403);
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
            'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,status,slip_url,booking_at,admin_note,created_at,updated_at',
          tenant_id: `eq.${order.tenant_id}`,
        },
      );
    }

    const updatedOrder = await transition(order.id, actionToStatus(body.action), `admin:${authUserId}`, {
      action: body.action,
      note: body.note ?? null,
    });
    const linePush = await pushLineOrderNotice(order.id, order.tenant_id, updatedOrder.status);

    return json({ line_push: linePush, order: updatedOrder });
  } catch (error) {
    return toErrorResponse(error);
  }
});
