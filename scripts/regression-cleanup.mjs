import { createClient } from '@supabase/supabase-js';

export async function cleanupAuthUserCustomerData({ authUserId, env = process.env, label = 'regression' }) {
  const supabaseUrl = env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey || !authUserId) {
    return;
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const customers = await mustMany(
    service.from('customers').select('id').eq('auth_user_id', authUserId),
    `Unable to find ${label} customers.`,
  );
  const customerIds = customers.map((row) => row.id);

  if (customerIds.length === 0) {
    return;
  }

  const sessions = await mustMany(
    service.from('chat_sessions').select('id').in('customer_id', customerIds),
    `Unable to find ${label} chat sessions.`,
  );
  const sessionIds = sessions.map((row) => row.id);
  const orders = await mustMany(
    service.from('orders').select('id').in('customer_id', customerIds),
    `Unable to find ${label} orders.`,
  );
  const orderIds = orders.map((row) => row.id);

  if (orderIds.length > 0) {
    await deleteByFilter(service, 'commission_entries', (query) => query.in('order_id', orderIds));
    await deleteByFilter(service, 'order_events', (query) => query.in('order_id', orderIds));
    await deleteByIds(service, 'orders', orderIds);
  }

  if (sessionIds.length > 0) {
    await deleteByFilter(service, 'chat_messages', (query) => query.in('session_id', sessionIds));
    await deleteByIds(service, 'chat_sessions', sessionIds);
  }

  await deleteByFilter(service, 'consents', (query) => query.in('customer_id', customerIds));
  await deleteByFilter(service, 'lab_reports', (query) => query.in('customer_id', customerIds));
  await deleteByFilter(service, 'user_facts', (query) => query.in('customer_id', customerIds));
  await deleteByFilter(service, 'wearable_metrics', (query) => query.in('customer_id', customerIds));
  await deleteByIds(service, 'customers', customerIds);

  console.log(`regression-cleanup: reset ${label} state for ${customerIds.length} customer row(s)`);
}

async function deleteByIds(service, table, ids) {
  if (ids.length === 0) {
    return;
  }

  await deleteByFilter(service, table, (query) => query.in('id', ids));
}

async function deleteByFilter(service, table, applyFilter) {
  await checked(applyFilter(service.from(table).delete()), `cleanup ${table}`);
}

async function checked(query, fallbackMessage) {
  const { error } = await query;

  if (error) {
    throw new Error(`${fallbackMessage}: ${error.message}`);
  }
}

async function mustMany(query, fallbackMessage) {
  const { data, error } = await query;

  if (error) {
    throw new Error(error.message ?? fallbackMessage);
  }

  return data ?? [];
}
