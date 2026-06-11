import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();

const files = {
  adminOrderAction: 'supabase/functions/admin-order-action/index.ts',
  chatOrchestrator: 'supabase/functions/chat-orchestrator/index.ts',
  db: 'supabase/functions/_shared/db.ts',
  factExtractor: 'supabase/functions/fact-extractor/index.ts',
  facts: 'supabase/functions/_shared/facts.ts',
  labIngest: 'supabase/functions/lab-ingest/index.ts',
  line: 'supabase/functions/_shared/line.ts',
  lineWebhook: 'supabase/functions/line-webhook/index.ts',
  orchestrate: 'supabase/functions/_shared/orchestrate.ts',
  orders: 'supabase/functions/_shared/orders.ts',
  referrerOrder: 'supabase/functions/referrer-order/index.ts',
  templates: 'lib/templates.ts',
  wearableIngest: 'supabase/functions/wearable-ingest/index.ts',
};

const v2EdgeFunctions = {
  adminOrderAction: files.adminOrderAction,
  chatOrchestrator: files.chatOrchestrator,
  factExtractor: files.factExtractor,
  labIngest: files.labIngest,
  lineWebhook: files.lineWebhook,
  referrerOrder: files.referrerOrder,
  wearableIngest: files.wearableIngest,
};

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

const sourceEntries = await Promise.all(
  Object.entries(files).map(async ([key, relativePath]) => [key, await read(relativePath)]),
);
const sources = Object.fromEntries(sourceEntries);
const violations = [];

function expect(name, condition, detail) {
  if (!condition) {
    violations.push(`${name}: ${detail}`);
  }
}

expect(
  'internal fact extractor auth',
  sources.db.includes('assertServiceRoleAuthorization') &&
    sources.factExtractor.includes("assertServiceRoleAuthorization(req.headers.get('authorization'))"),
  'fact-extractor must require the shared service-role guard before reading chat messages',
);

expect(
  'internal function invocation auth',
  sources.db.includes('invokeInternalFunction') && sources.db.includes('Authorization: `Bearer ${serviceRoleKey}`'),
  'internal edge function calls must carry the service-role bearer token',
);

expect(
  'active order tenant scope',
  sources.orders.includes('loadActiveOrder(sessionId: string, tenantId: string)') &&
    sources.orders.includes('tenant_id: `eq.${tenantId}`'),
  'loadActiveOrder must require tenantId and include tenant_id in the REST filter',
);

expect(
  'order field write scope',
  sources.orders.includes('tenantId: string') &&
    sources.orders.includes('tenant_id: `eq.${scope.tenantId}`') &&
    sources.orders.includes('customer_id: `eq.${scope.customerId}`') &&
    sources.orders.includes('session_id: `eq.${scope.sessionId}`'),
  'updateOrderFields must scope writes by tenant and, when provided, customer/session',
);

expect(
  'chat order ownership validation',
  sources.orchestrate.includes('existingOrder.customer_id !== customer.id') &&
    sources.orchestrate.includes('existingOrder.session_id !== sessionId') &&
    sources.orchestrate.includes('tenantId: tenant.id'),
  'chat order actions must verify current tenant/session/customer before updating or submitting orders',
);

expect(
  'chat action response persistence',
  sources.orchestrate.includes('async function completeActionResponseTurn') &&
    sources.orchestrate.includes('ORDER_INFO_COMPLETE_NOTICE_TH') &&
    sources.templates.includes('ORDER_INFO_COMPLETE_NOTICE_TH') &&
    sources.orchestrate.includes('await persistUserMessage(session.id, clientMsgId, message)') &&
    sources.orchestrate.includes('await persistSystemNotice(session.id, actionResult.response.text)') &&
    sources.orchestrate.includes('await updateSessionAfterAssistant(session.id, tenant.id, actionResult.response.text)') &&
    sources.orchestrate.includes('systemNoticePersisted: true'),
  'chat action responses that skip the model must still persist the user turn and a system notice unless the transition RPC already inserted it',
);

expect(
  'admin order tenant allow-list',
  sources.adminOrderAction.includes("selectMany<{ role: string; tenant_id: string }>('tenant_members'") &&
    sources.adminOrderAction.includes('tenant_id: `in.(${tenantFilter})`') &&
    sources.adminOrderAction.includes('tenant_id: `eq.${order.tenant_id}`'),
  'admin order actions must load orders through the authenticated staff member tenant allow-list',
);

expect(
  'fact follow-up tenant filters',
  sources.factExtractor.includes('tenant_id: `eq.${session.tenant_id}`') &&
    sources.facts.includes('tenant_id: `eq.${tenantId}`'),
  'fact extraction follow-up reads and writes must include tenant filters after session ownership is known',
);

expect(
  'lab and wearable follow-up tenant filters',
  sources.labIngest.includes('tenant_id: `eq.${customer.tenant_id}`') &&
    sources.labIngest.includes('tenant_id: `eq.${report.tenant_id}`') &&
    sources.wearableIngest.includes('tenant_id: `eq.${customer.tenant_id}`'),
  'lab and wearable follow-up writes must include tenant filters where tenant context is available',
);

expect(
  'assisted referrer direct credit',
  sources.referrerOrder.includes("channel: 'referrer'") &&
    sources.referrerOrder.includes('referrer_id: referrer.id') &&
    sources.referrerOrder.includes('referrer_id: `eq.${referrer.id}`'),
  'referrer assisted orders must credit the authenticated referrer directly and scope payment_done to that referrer',
);

expect(
  'LINE PromptPay QR image reply',
  sources.lineWebhook.includes('QRCode.toDataURL(order.qr_payload') &&
    sources.lineWebhook.includes("uploadStorageObject('line-assets', `promptpay/${order.id}.png`, qrBytes, 'image/png')") &&
    sources.lineWebhook.includes('orderQrLineImageMessage(qrUrl)') &&
    sources.lineWebhook.includes('orderPaymentLineFlexMessage(order)') &&
    sources.line.includes('export function orderQrLineImageMessage') &&
    sources.line.includes("type: 'image'") &&
    sources.line.includes('originalContentUrl: qrUrl') &&
    sources.line.includes('previewImageUrl: qrUrl'),
  'LINE QR replies must render/upload PNG and send a LINE image message while keeping a payment postback action',
);

for (const [name] of Object.entries(v2EdgeFunctions)) {
  const source = sources[name];

  expect(
    `${name} standard envelope helpers`,
    source.includes('handleOptions') &&
      source.includes('json') &&
      source.includes('toErrorResponse') &&
      !source.includes('new Response('),
    'v2 edge functions must use shared CORS/envelope helpers instead of raw Response objects',
  );
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}

console.log(`v2-edge-security-audit: PASS (${Object.keys(files).length} files scanned)`);
