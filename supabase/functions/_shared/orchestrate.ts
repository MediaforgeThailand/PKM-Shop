import { buildCatalogJson, buildPersonalContext, buildRecentChat, inferIntentCategory } from './context.ts';
import {
  assertTenant,
  insertRow,
  invokeInternalFunction,
  resolveAuthUserId,
  resolveOrCreateCustomer,
  selectMany,
  selectOne,
  updateRows,
  upsertRow,
} from './db.ts';
import { HttpError, z } from './http.ts';
import { filterKnownProductMarkerKeys, parseProductMarker } from './marker.ts';
import {
  assertOrderBelongsToSession,
  assertPaymentSlipPathForOrder,
  formatActiveOrderContext,
  loadActiveOrder,
  missingOrderFields,
  paymentSlipStoragePath,
  toOrderPanel,
  transition,
  updateOrderFields,
} from './orders.ts';
import { callMiraPrompt, callOrderFieldExtractor } from './openai.ts';
import { resolveAttributedReferrerId } from './referrals.ts';
import { createSignedUploadUrl } from './storage.ts';
import { ORDER_INFO_COMPLETE_NOTICE_TH, ORDER_PAYMENT_SUBMITTED_NOTICE_TH } from './templates.ts';
import type {
  ChatMessageRow,
  ChatOrchestratorRequest,
  ChatOrchestratorResponse,
  ChatSlipUploadResponse,
  ChatProduct,
  ChatSessionRow,
  CustomerRow,
  OrderRow,
  OrderWithProductRow,
  ProductSummary,
  ReferrerRow,
  TenantRow,
} from './types.ts';

const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('consent_granted'),
  }),
  z.object({
    catalog_key: z.string().min(1),
    type: z.literal('select_product'),
  }),
  z.object({
    buyer_name: z.string().min(1),
    buyer_phone: z.string().min(1),
    order_id: z.string().uuid(),
    preferred_date: z.string().optional(),
    type: z.literal('order_form_submit'),
  }),
  z.object({
    order_id: z.string().uuid(),
    slip_path: z.string().optional(),
    type: z.literal('payment_done'),
  }),
  z.object({
    content_type: z.enum(['image/jpeg', 'image/png']),
    order_id: z.string().uuid(),
    type: z.literal('request_slip_upload'),
  }),
  z.object({
    type: z.literal('refresh_order'),
  }),
]);

export const chatRequestSchema = z.object({
  action: actionSchema.nullable(),
  channel: z.enum(['app', 'pwa', 'line']),
  client_msg_id: z.string().uuid(),
  message: z.string().trim(),
  ref_code: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{6}$/).optional(),
  session_id: z.string().uuid().nullable(),
  tenant_slug: z.string().regex(/^[a-z0-9-]{2,32}$/),
});

function nowIso() {
  return new Date().toISOString();
}

async function resolveOrCreateSession({
  channel,
  customer,
  sessionId,
  tenant,
}: {
  channel: 'app' | 'line' | 'pwa';
  customer: CustomerRow;
  sessionId: string | null;
  tenant: TenantRow;
}) {
  if (sessionId) {
    const session = await selectOne<ChatSessionRow>('chat_sessions', {
      customer_id: `eq.${customer.id}`,
      id: `eq.${sessionId}`,
      select: 'id,tenant_id,customer_id,channel,flagged,last_message_at,created_at',
      tenant_id: `eq.${tenant.id}`,
    });

    if (!session) {
      throw new HttpError('VALIDATION', 'Chat session not found for this customer.', 404);
    }

    return session;
  }

  return insertRow<ChatSessionRow>('chat_sessions', {
    channel,
    customer_id: customer.id,
    last_message_at: nowIso(),
    tenant_id: tenant.id,
  }, {
    select: 'id,tenant_id,customer_id,channel,flagged,last_message_at,created_at',
  });
}

type ActionResult = {
  order?: OrderWithProductRow | null;
  response?: ChatOrchestratorResponse;
};

async function loadOrderForPanel(orderId: string, tenantId: string) {
  return selectOne<OrderWithProductRow>('orders', {
    id: `eq.${orderId}`,
    select:
      'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,admin_note,created_at,updated_at,products(name,catalog_key,category,price_baht)',
    tenant_id: `eq.${tenantId}`,
  });
}

async function productByCatalogKey(tenantId: string, catalogKey: string) {
  return selectOne<ProductSummary>('products', {
    active: 'eq.true',
    catalog_key: `eq.${catalogKey}`,
    select: 'id,tenant_id,catalog_key,name,description,price_baht,category,image_url,branch_info,requires_appointment,active',
    tenant_id: `eq.${tenantId}`,
  });
}

async function maybeApplyReferralCode(customer: CustomerRow, tenant: TenantRow, refCode?: string) {
  if (!refCode || customer.referred_by) {
    return customer;
  }

  const referrer = await selectOne<ReferrerRow>('referrers', {
    active: 'eq.true',
    ref_code: `eq.${refCode}`,
    select: 'id,tenant_id,ref_code,name,type,phone,auth_user_id,commission_scheme,active,created_at',
    tenant_id: `eq.${tenant.id}`,
  });

  if (!referrer) {
    return customer;
  }

  const rows = await updateRows<CustomerRow>(
    'customers',
    {
      referred_at: nowIso(),
      referred_by: referrer.id,
    },
    {
      id: `eq.${customer.id}`,
      select: 'id,tenant_id,auth_user_id,line_user_id,nickname,phone,referred_by,referred_at,created_at',
      tenant_id: `eq.${tenant.id}`,
    },
  );

  return rows[0] ?? customer;
}

async function createOrderFromProduct({
  channel,
  customer,
  product,
  sessionId,
  tenant,
}: {
  channel: 'app' | 'line' | 'pwa';
  customer: CustomerRow;
  product: ProductSummary;
  sessionId: string;
  tenant: TenantRow;
}) {
  const referrerId = resolveAttributedReferrerId(customer, tenant);
  const referrer = referrerId
    ? await selectOne<Pick<ReferrerRow, 'commission_scheme'>>('referrers', {
      id: `eq.${referrerId}`,
      select: 'commission_scheme',
      tenant_id: `eq.${tenant.id}`,
    })
    : null;
  const order = await insertRow<OrderRow>('orders', {
    amount_baht: product.price_baht,
    buyer_phone: customer.phone,
    channel: channel === 'app' ? 'chat_app' : channel === 'line' ? 'chat_line' : 'chat_pwa',
    commission_scheme_snapshot: referrer?.commission_scheme ?? null,
    customer_id: customer.id,
    product_id: product.id,
    qty: 1,
    referrer_id: referrerId,
    session_id: sessionId,
    tenant_id: tenant.id,
  }, {
    select:
      'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,admin_note,created_at,updated_at',
  });

  return loadOrderForPanel(order.id, tenant.id);
}

async function maybeAdvanceCollectingOrder(order: OrderWithProductRow | null) {
  if (!order || order.status !== 'collecting_info' || missingOrderFields(order).length > 0) {
    return order;
  }

  await transition(order.id, 'awaiting_payment', 'ai', { reason: 'buyer_info_complete' });

  return loadOrderForPanel(order.id, order.tenant_id);
}

async function createSlipUpload({
  action,
  customer,
  sessionId,
  tenant,
}: {
  action: Extract<ChatOrchestratorRequest['action'], { type: 'request_slip_upload' }>;
  customer: CustomerRow;
  sessionId: string;
  tenant: TenantRow;
}): Promise<ChatSlipUploadResponse> {
  const existingOrder = await loadOrderForPanel(action.order_id, tenant.id);
  assertOrderBelongsToSession(existingOrder, {
    customerId: customer.id,
    sessionId,
  });

  const storagePath = paymentSlipStoragePath({
    contentType: action.content_type,
    orderId: action.order_id,
    tenantId: tenant.id,
  });
  const uploadUrl = await createSignedUploadUrl('payment-slips', storagePath, 10 * 60);

  return {
    storage_path: storagePath,
    upload_url: uploadUrl,
  };
}

async function refreshActiveOrder(session: ChatSessionRow, tenant: TenantRow): Promise<ChatOrchestratorResponse> {
  const order = await loadActiveOrder(session.id, tenant.id);

  return {
    order: toOrderPanel(order, tenant),
    products: [],
    session_id: session.id,
    text: '',
  };
}

async function handleAction({
  action,
  channel,
  customer,
  sessionId,
  tenant,
}: {
  action: ChatOrchestratorRequest['action'];
  channel: 'app' | 'line' | 'pwa';
  customer: CustomerRow;
  sessionId: string;
  tenant: TenantRow;
}): Promise<ActionResult> {
  if (!action) {
    return {};
  }

  if (action.type === 'consent_granted') {
    await insertRow('consents', {
      customer_id: customer.id,
      granted: true,
      kind: 'health_data_collection',
      tenant_id: tenant.id,
    });
    return {};
  }

  if (action.type === 'select_product') {
    const product = await productByCatalogKey(tenant.id, action.catalog_key);

    if (!product) {
      throw new HttpError('VALIDATION', 'Product not found.', 404);
    }

    return {
      order: await createOrderFromProduct({
        channel,
        customer,
        product,
        sessionId,
        tenant,
      }),
    };
  }

  if (action.type === 'order_form_submit') {
    const existingOrder = await loadOrderForPanel(action.order_id, tenant.id);

    assertOrderBelongsToSession(existingOrder, {
      customerId: customer.id,
      sessionId,
    });

    const order = await updateOrderFields(action.order_id, {
      customerId: customer.id,
      sessionId,
      tenantId: tenant.id,
    }, {
      buyer_name: action.buyer_name,
      buyer_phone: action.buyer_phone,
      preferred_date: action.preferred_date,
    });
    const loaded = await maybeAdvanceCollectingOrder(await loadOrderForPanel(order.id, tenant.id));

    return {
      response: {
        order: toOrderPanel(loaded ?? null, tenant),
        products: [],
        session_id: sessionId,
        text: ORDER_INFO_COMPLETE_NOTICE_TH,
      },
    };
  }

  if (action.type === 'payment_done') {
    const existingOrder = await loadOrderForPanel(action.order_id, tenant.id);

    assertOrderBelongsToSession(existingOrder, {
      customerId: customer.id,
      sessionId,
    });

    if (action.slip_path) {
      await updateRows<OrderRow>(
        'orders',
        {
          slip_url: assertPaymentSlipPathForOrder({
            orderId: action.order_id,
            slipPath: action.slip_path,
            tenantId: tenant.id,
          }),
          updated_at: nowIso(),
        },
        {
          customer_id: `eq.${customer.id}`,
          id: `eq.${action.order_id}`,
          select:
            'id,tenant_id,customer_id,session_id,product_id,qty,amount_baht,buyer_name,buyer_phone,preferred_branch,preferred_date,channel,referrer_id,commission_scheme_snapshot,status,slip_url,booking_at,admin_note,created_at,updated_at',
          session_id: `eq.${sessionId}`,
          tenant_id: `eq.${tenant.id}`,
        },
      );
    }

    const order = await transition(action.order_id, 'submitted', 'customer', { channel });
    const loaded = await loadOrderForPanel(order.id, tenant.id);

    return {
      response: {
        order: toOrderPanel(loaded, tenant),
        products: [],
        session_id: sessionId,
        text: ORDER_PAYMENT_SUBMITTED_NOTICE_TH,
      },
    };
  }

  return {};
}

async function persistUserMessage(sessionId: string, clientMsgId: string, content: string) {
  const existing = await selectOne<ChatMessageRow>('chat_messages', {
    client_msg_id: `eq.${clientMsgId}`,
    select: 'id,session_id,role,content,marker_product_ids,openai_response_id,client_msg_id,created_at',
    session_id: `eq.${sessionId}`,
  });

  if (existing) {
    return {
      duplicate: true,
      row: existing,
    };
  }

  const row = await insertRow<ChatMessageRow>('chat_messages', {
    client_msg_id: clientMsgId,
    content,
    role: 'user',
    session_id: sessionId,
  }, {
    select: 'id,session_id,role,content,marker_product_ids,openai_response_id,client_msg_id,created_at',
  });

  return {
    duplicate: false,
    row,
  };
}

async function cachedAssistantReply(sessionId: string, userMessageCreatedAt: string) {
  return selectOne<ChatMessageRow>('chat_messages', {
    created_at: `gte.${userMessageCreatedAt}`,
    order: 'created_at.asc',
    role: 'eq.assistant',
    select: 'id,session_id,role,content,marker_product_ids,openai_response_id,client_msg_id,created_at',
    session_id: `eq.${sessionId}`,
  });
}

async function enforceRateLimit(customerId: string) {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const rows = await selectMany<{ id: string }>('chat_messages', {
    created_at: `gte.${since}`,
    limit: '21',
    role: 'eq.user',
    select: 'id,chat_sessions!inner(customer_id)',
    'chat_sessions.customer_id': `eq.${customerId}`,
  });

  if (rows.length >= 20) {
    throw new HttpError('RATE_LIMITED', 'Too many messages. Please wait a moment.', 429);
  }
}

async function lookupProductsByCatalogKeys(tenantId: string, catalogKeys: string[]) {
  if (catalogKeys.length === 0) {
    return [];
  }

  const rows = await selectMany<ProductSummary>('products', {
    active: 'eq.true',
    catalog_key: `in.(${catalogKeys.join(',')})`,
    select: 'id,tenant_id,catalog_key,name,description,price_baht,category,image_url,branch_info,requires_appointment,active',
    tenant_id: `eq.${tenantId}`,
  });
  const rowByKey = new Map(rows.map((row) => [row.catalog_key, row]));
  const resolvedKeys = filterKnownProductMarkerKeys(catalogKeys, rowByKey.keys(), (unknownKeys) => {
    console.warn('marker_unknown_key', { catalogKeys: unknownKeys, tenantId });
  });

  return resolvedKeys.map((key) => rowByKey.get(key)).filter((row): row is ProductSummary => Boolean(row));
}

function toChatProduct(row: ProductSummary): ChatProduct {
  return {
    catalog_key: row.catalog_key,
    description: row.description,
    image_url: row.image_url,
    name: row.name,
    price_baht: row.price_baht,
  };
}

async function persistAssistantMessage({
  catalogKeys,
  responseId,
  sessionId,
  text,
}: {
  catalogKeys: string[];
  responseId: string | null;
  sessionId: string;
  text: string;
}) {
  return insertRow<ChatMessageRow>('chat_messages', {
    content: text,
    marker_product_ids: catalogKeys,
    openai_response_id: responseId,
    role: 'assistant',
    session_id: sessionId,
  }, {
    select: 'id,session_id,role,content,marker_product_ids,openai_response_id,client_msg_id,created_at',
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

async function updateSessionAfterAssistant(sessionId: string, tenantId: string, text: string) {
  const emergency = text.includes('1669') || text.includes('ฉุกเฉิน') || text.includes('ห้องฉุกเฉิน');

  // Never clear an existing flag: a session escalated earlier must stay visible
  // to admin oversight even after the conversation moves on.
  await updateRows<ChatSessionRow>(
    'chat_sessions',
    {
      last_message_at: nowIso(),
      ...(emergency ? { flagged: 'emergency' } : {}),
    },
    {
      id: `eq.${sessionId}`,
      select: 'id,tenant_id,customer_id,channel,flagged,last_message_at,created_at',
      tenant_id: `eq.${tenantId}`,
    },
  );
}

async function completeActionResponseTurn({
  actionResult,
  clientMsgId,
  message,
  session,
  tenant,
}: {
  actionResult: Required<Pick<ActionResult, 'response'>>;
  clientMsgId: string;
  message: string;
  session: ChatSessionRow;
  tenant: TenantRow;
}) {
  await persistUserMessage(session.id, clientMsgId, message);
  await persistSystemNotice(session.id, actionResult.response.text);
  await updateSessionAfterAssistant(session.id, tenant.id, actionResult.response.text);

  return actionResult.response;
}

async function buildResponseFromCachedMessage(sessionId: string, tenantId: string, message: ChatMessageRow): Promise<ChatOrchestratorResponse> {
  const products = await lookupProductsByCatalogKeys(tenantId, message.marker_product_ids);

  return {
    order: null,
    products: products.map(toChatProduct),
    session_id: sessionId,
    text: message.content,
  };
}

async function updateCollectingOrderFromMessage(order: OrderWithProductRow | null, message: string) {
  if (!order || order.status !== 'collecting_info') {
    return order;
  }

  const extracted = await callOrderFieldExtractor(message);

  if (!extracted.buyer_name && !extracted.buyer_phone && !extracted.preferred_date) {
    return order;
  }

  const updated = await updateOrderFields(order.id, {
    customerId: order.customer_id ?? undefined,
    sessionId: order.session_id ?? undefined,
    tenantId: order.tenant_id,
  }, extracted);

  return maybeAdvanceCollectingOrder(await loadOrderForPanel(updated.id, order.tenant_id));
}

async function resolveOrCreateLineCustomer(tenantId: string, lineUserId: string) {
  return upsertRow<CustomerRow>(
    'customers',
    {
      line_user_id: lineUserId,
      tenant_id: tenantId,
    },
    'tenant_id,line_user_id',
    {
      select: 'id,tenant_id,auth_user_id,line_user_id,nickname,phone,referred_by,referred_at,created_at',
    },
  );
}

async function resolveOrCreateLatestSession({
  channel,
  customer,
  tenant,
}: {
  channel: 'line';
  customer: CustomerRow;
  tenant: TenantRow;
}) {
  const existing = await selectOne<ChatSessionRow>('chat_sessions', {
    channel: `eq.${channel}`,
    customer_id: `eq.${customer.id}`,
    order: 'last_message_at.desc',
    select: 'id,tenant_id,customer_id,channel,flagged,last_message_at,created_at',
    tenant_id: `eq.${tenant.id}`,
  });

  if (existing) {
    return existing;
  }

  return insertRow<ChatSessionRow>('chat_sessions', {
    channel,
    customer_id: customer.id,
    last_message_at: nowIso(),
    tenant_id: tenant.id,
  }, {
    select: 'id,tenant_id,customer_id,channel,flagged,last_message_at,created_at',
  });
}

// Shared turn pipeline for every channel: action handling has already run, the
// session/customer are resolved, and the only channel difference is how they were
// resolved upstream.
async function completeChatTurn({
  actionResult,
  clientMsgId,
  customer,
  message,
  session,
  tenant,
}: {
  actionResult: ActionResult;
  clientMsgId: string;
  customer: CustomerRow;
  message: string;
  session: ChatSessionRow;
  tenant: TenantRow;
}): Promise<ChatOrchestratorResponse> {
  const userPersist = await persistUserMessage(session.id, clientMsgId, message);

  if (userPersist.duplicate) {
    const cached = await cachedAssistantReply(session.id, userPersist.row.created_at);

    if (cached) {
      return buildResponseFromCachedMessage(session.id, tenant.id, cached);
    }
  }

  await enforceRateLimit(customer.id);

  let activeOrder = actionResult.order ?? await loadActiveOrder(session.id, tenant.id);
  const intentCategory = inferIntentCategory(message);
  const activeOrderContext = formatActiveOrderContext(activeOrder);
  const [personalContext, recentChat, productCatalog] = await Promise.all([
    buildPersonalContext(customer.id, activeOrderContext),
    buildRecentChat(session.id),
    buildCatalogJson(tenant.id, intentCategory),
  ]);
  const promptResult = await callMiraPrompt(
    {
      brand_name: tenant.display_name,
      personal_context: personalContext,
      product_catalog: productCatalog,
      recent_chat: recentChat,
      user_nickname: customer.nickname ?? 'ลูกค้า',
    },
    message,
  );
  const parsed = parseProductMarker(promptResult.text);
  const productRows = await lookupProductsByCatalogKeys(tenant.id, parsed.catalogKeys);
  const resolvedKeys = productRows.map((row) => row.catalog_key);
  const assistantMessage = await persistAssistantMessage({
    catalogKeys: resolvedKeys,
    responseId: promptResult.responseId,
    sessionId: session.id,
    text: parsed.text,
  });

  await updateSessionAfterAssistant(session.id, tenant.id, parsed.text);

  activeOrder = await updateCollectingOrderFromMessage(activeOrder, message);

  void invokeInternalFunction('fact-extractor', { message_id: userPersist.row.id }).catch((error) => {
    console.warn('fact_extractor_invoke_failed', error instanceof Error ? error.message : error);
  });

  return {
    order: toOrderPanel(activeOrder, tenant),
    products: productRows.map(toChatProduct),
    session_id: session.id,
    text: assistantMessage.content,
  };
}

export async function orchestrateChat(
  request: ChatOrchestratorRequest,
  authorization: string | null,
): Promise<ChatOrchestratorResponse | ChatSlipUploadResponse> {
  if (!['refresh_order', 'request_slip_upload'].includes(request.action?.type ?? '') && request.message.length === 0) {
    throw new HttpError('VALIDATION', 'Message is required.', 400);
  }

  const tenant = await assertTenant(request.tenant_slug);
  const authUserId = await resolveAuthUserId(authorization);
  let customer = await resolveOrCreateCustomer(tenant.id, authUserId);
  customer = await maybeApplyReferralCode(customer, tenant, request.ref_code);
  const session = await resolveOrCreateSession({
    channel: request.channel,
    customer,
    sessionId: request.session_id,
    tenant,
  });

  if (request.action?.type === 'request_slip_upload') {
    return createSlipUpload({
      action: request.action,
      customer,
      sessionId: session.id,
      tenant,
    });
  }

  if (request.action?.type === 'refresh_order') {
    return refreshActiveOrder(session, tenant);
  }

  const actionResult = await handleAction({
    action: request.action,
    channel: request.channel,
    customer,
    sessionId: session.id,
    tenant,
  });

  if (actionResult.response) {
    return completeActionResponseTurn({
      actionResult: { response: actionResult.response },
      clientMsgId: request.client_msg_id,
      message: request.message,
      session,
      tenant,
    });
  }

  return completeChatTurn({
    actionResult,
    clientMsgId: request.client_msg_id,
    customer,
    message: request.message,
    session,
    tenant,
  });
}

export async function orchestrateLine(request: {
  action: ChatOrchestratorRequest['action'];
  client_msg_id: string;
  line_user_id: string;
  message: string;
  tenant_slug: string;
}): Promise<ChatOrchestratorResponse> {
  const tenant = await assertTenant(request.tenant_slug);
  const customer = await resolveOrCreateLineCustomer(tenant.id, request.line_user_id);
  const session = await resolveOrCreateLatestSession({
    channel: 'line',
    customer,
    tenant,
  });

  const actionResult = await handleAction({
    action: request.action,
    channel: 'line',
    customer,
    sessionId: session.id,
    tenant,
  });

  if (actionResult.response) {
    return completeActionResponseTurn({
      actionResult: { response: actionResult.response },
      clientMsgId: request.client_msg_id,
      message: request.message,
      session,
      tenant,
    });
  }

  return completeChatTurn({
    actionResult,
    clientMsgId: request.client_msg_id,
    customer,
    message: request.message,
    session,
    tenant,
  });
}
