// PKM-Shop — conversation context for the AI sales agent. Supplies the five prompt variables
// (brand_name/user_nickname/personal_context/recent_chat/product_catalog). Catalog is filtered
// to in-stock goods (Ready.md §7: never offer sold-out items).
import { selectMany, selectOne } from './db.ts';

const EMPTY_RECENT_CHAT = 'ไม่มีแชทล่าสุด';
const EMPTY_PERSONAL = 'ยังไม่มีข้อมูลลูกค้า';
const RECENT_BUDGET = 1500;

type ChatMsg = { role: string; content: string; created_at: string };

export async function buildRecentChat(sessionId: string): Promise<string> {
  const rows = await selectMany<ChatMsg>('chat_messages', {
    limit: '8',
    order: 'created_at.desc',
    role: 'in.(user,assistant)',
    select: 'role,content,created_at',
    session_id: `eq.${sessionId}`,
  });
  if (rows.length === 0) {
    return EMPTY_RECENT_CHAT;
  }
  let ordered = rows.reverse();
  while (ordered.length > 0) {
    const rendered = ordered.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
    if (rendered.length <= RECENT_BUDGET) {
      return rendered;
    }
    ordered = ordered.slice(1);
  }
  return EMPTY_RECENT_CHAT;
}

type CatalogRow = {
  catalog_key: string;
  name: string;
  description: string;
  price_baht: number;
  category: string | null;
  stock_qty: number;
  reserved_qty: number;
};

export async function buildCatalogJson(tenantId: string): Promise<string> {
  const rows = await selectMany<CatalogRow>('products', {
    active: 'eq.true',
    limit: '120',
    order: 'created_at.desc',
    select: 'catalog_key,name,description,price_baht,category,stock_qty,reserved_qty',
    tenant_id: `eq.${tenantId}`,
  });
  const available = rows
    .filter((r) => (r.stock_qty ?? 0) - (r.reserved_qty ?? 0) > 0)
    .slice(0, 60)
    .map((r) => ({
      category: r.category,
      description: (r.description ?? '').slice(0, 200),
      id: r.catalog_key,
      name: r.name,
      price: r.price_baht,
    }));
  return JSON.stringify(available);
}

type LastOrder = {
  order_no: string;
  status: string;
  grand_total: number;
  address_text: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
};

// Saved shipping address + current order status become the "personal context" the model uses
// to avoid re-asking the address and to answer status questions.
export async function buildPersonalContext(tenantId: string, customerId: string): Promise<string> {
  const last = await selectOne<LastOrder>('orders', {
    customer_id: `eq.${customerId}`,
    limit: '1',
    order: 'created_at.desc',
    select: 'order_no,status,grand_total,address_text,recipient_name,recipient_phone',
    tenant_id: `eq.${tenantId}`,
  });
  if (!last) {
    return EMPTY_PERSONAL;
  }
  const lines: string[] = [];
  if (last.address_text) {
    const who = [last.recipient_name, last.recipient_phone].filter(Boolean).join(' ');
    lines.push(`ที่อยู่จัดส่งล่าสุด: ${last.address_text}${who ? ` (${who})` : ''}`);
  }
  if (!['delivered', 'cancelled'].includes(last.status)) {
    lines.push(`คำสั่งซื้อ ${last.order_no}: สถานะ ${last.status}`);
  }
  return lines.length ? lines.join('\n') : EMPTY_PERSONAL;
}
