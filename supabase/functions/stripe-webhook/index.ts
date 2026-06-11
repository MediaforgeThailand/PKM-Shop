import { insertRow, selectOne, updateRows } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse } from '../_shared/http.ts';
import { transition } from '../_shared/orders.ts';
import { asStripeCheckoutSession, stripeMinorUnitsForBaht, verifyStripeWebhookEvent } from '../_shared/stripe.ts';
import { ORDER_PAYMENT_SUBMITTED_NOTICE_TH } from '../_shared/templates.ts';
import type { ChatMessageRow, OrderRow } from '../_shared/types.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type Embedded<T> = T | T[] | null;

type StripeOrderRow = OrderRow & {
  products?: Embedded<{
    name: string | null;
  }>;
};

type StripeWebhookResult = {
  event_id: string;
  handled: boolean;
  order_id: string | null;
  reason?: string;
};

async function persistSystemNotice(sessionId: string, text: string) {
  return insertRow<ChatMessageRow>('chat_messages', {
    content: text,
    role: 'system_notice',
    session_id: sessionId,
  }, {
    select: 'id,session_id,role,content,marker_product_ids,openai_response_id,client_msg_id,created_at',
  });
}

async function updateSessionTimestamp(sessionId: string, tenantId: string) {
  await updateRows(
    'chat_sessions',
    {
      last_message_at: new Date().toISOString(),
    },
    {
      id: `eq.${sessionId}`,
      select: 'id',
      tenant_id: `eq.${tenantId}`,
    },
  );
}

async function loadOrder(orderId: string, tenantId?: string | null) {
  return selectOne<StripeOrderRow>('orders', {
    id: `eq.${orderId}`,
    select:
      'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,branch_id,buyer_age,admin_note,created_at,updated_at,payment_provider,stripe_checkout_session_id,stripe_payment_intent_id,stripe_payment_status,paid_at,products(name)',
    ...(tenantId ? { tenant_id: `eq.${tenantId}` } : {}),
  });
}

async function markStripeSessionPaid(eventId: string, session: NonNullable<ReturnType<typeof asStripeCheckoutSession>>): Promise<StripeWebhookResult> {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  const tenantId = session.metadata?.tenant_id ?? null;

  if (!orderId) {
    return {
      event_id: eventId,
      handled: false,
      order_id: null,
      reason: 'missing_order_id',
    };
  }

  if (session.mode !== 'payment' || session.payment_status !== 'paid') {
    return {
      event_id: eventId,
      handled: false,
      order_id: orderId,
      reason: 'session_not_paid',
    };
  }

  const order = await loadOrder(orderId, tenantId);

  if (!order) {
    throw new HttpError('VALIDATION', 'Stripe checkout order was not found.', 404);
  }

  if ((session.currency ?? '').toLowerCase() !== 'thb') {
    throw new HttpError('VALIDATION', 'Stripe checkout currency does not match THB orders.', 400);
  }

  if (session.amount_total !== stripeMinorUnitsForBaht(order.amount_baht)) {
    throw new HttpError('VALIDATION', 'Stripe checkout amount does not match the order amount.', 400);
  }

  await updateRows<OrderRow>(
    'orders',
    {
      paid_at: new Date().toISOString(),
      payment_provider: 'stripe',
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent,
      stripe_payment_status: session.payment_status,
      updated_at: new Date().toISOString(),
    },
    {
      id: `eq.${order.id}`,
      select:
        'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,branch_id,buyer_age,admin_note,created_at,updated_at,payment_provider,stripe_checkout_session_id,stripe_payment_intent_id,stripe_payment_status,paid_at',
      tenant_id: `eq.${order.tenant_id}`,
    },
  );

  if (order.status !== 'awaiting_payment') {
    return {
      event_id: eventId,
      handled: true,
      order_id: order.id,
      reason: `order_already_${order.status}`,
    };
  }

  const updatedOrder = await transition(order.id, 'submitted', 'system', {
    provider: 'stripe',
    stripe_checkout_session_id: session.id,
    stripe_event_id: eventId,
    stripe_payment_intent_id: session.payment_intent,
  });

  if (order.session_id && order.status !== updatedOrder.status) {
    await persistSystemNotice(order.session_id, ORDER_PAYMENT_SUBMITTED_NOTICE_TH);
    await updateSessionTimestamp(order.session_id, order.tenant_id);
  }

  return {
    event_id: eventId,
    handled: true,
    order_id: order.id,
  };
}

async function markStripeSessionUnpaid(eventId: string, session: NonNullable<ReturnType<typeof asStripeCheckoutSession>>, status: string) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  const tenantId = session.metadata?.tenant_id ?? null;

  if (!orderId) {
    return {
      event_id: eventId,
      handled: false,
      order_id: null,
      reason: 'missing_order_id',
    };
  }

  const order = await loadOrder(orderId, tenantId);

  if (!order) {
    return {
      event_id: eventId,
      handled: false,
      order_id: orderId,
      reason: 'order_not_found',
    };
  }

  await updateRows<OrderRow>(
    'orders',
    {
      payment_provider: 'stripe',
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent,
      stripe_payment_status: status,
      updated_at: new Date().toISOString(),
    },
    {
      id: `eq.${order.id}`,
      select:
        'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,branch_id,buyer_age,admin_note,created_at,updated_at,payment_provider,stripe_checkout_session_id,stripe_payment_intent_id,stripe_payment_status,paid_at',
      tenant_id: `eq.${order.tenant_id}`,
    },
  );

  return {
    event_id: eventId,
    handled: true,
    order_id: order.id,
    reason: status,
  };
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
    const rawBody = await req.text();
    const event = await verifyStripeWebhookEvent(rawBody, req.headers.get('stripe-signature'));
    const session = asStripeCheckoutSession(event.data.object);

    if (!session) {
      return json<StripeWebhookResult>({
        event_id: event.id,
        handled: false,
        order_id: null,
        reason: 'unsupported_object',
      });
    }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      return json(await markStripeSessionPaid(event.id, session));
    }

    if (event.type === 'checkout.session.expired') {
      return json(await markStripeSessionUnpaid(event.id, session, 'expired'));
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      return json(await markStripeSessionUnpaid(event.id, session, 'failed'));
    }

    return json<StripeWebhookResult>({
      event_id: event.id,
      handled: false,
      order_id: session.metadata?.order_id ?? session.client_reference_id,
      reason: 'unhandled_event_type',
    });
  } catch (error) {
    return toErrorResponse(error);
  }
});
