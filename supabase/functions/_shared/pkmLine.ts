// PKM-Shop — LINE Flex builders + postback parsing for the goods-delivery chat. Reuses the
// transport (verify/reply/push/text) from line.ts; only the card/postback vocabulary is PKM.
import type { LineFlexMessage } from './line.ts';
import type { DeliveryType, PkmCategory, PkmChatAction, PkmOrderPanel, PkmProduct } from './pkmTypes.ts';

const BRAND = '#0F6E56';

export const DELIVERY_LABELS: Record<DeliveryType, string> = {
  rider: 'ส่งปกติ (ไรเดอร์)',
  express_grab: 'ด่วน (Grab)',
  lalamove: 'นอกเขต (Lalamove)',
  parcel_kerry: 'พัสดุ (Kerry)',
};

function baht(n: number): string {
  return `฿${n.toLocaleString('th-TH')}`;
}

// LINE postback -> deterministic chat action.
export function pkmPostbackToAction(data: string | undefined): { action: PkmChatAction | null; message: string } {
  if (!data) {
    return { action: null, message: 'สวัสดี' };
  }
  if (data === 'browse_categories') {
    return { action: { type: 'browse_categories' }, message: 'ดูสินค้า' };
  }
  if (data === 'get_order_status') {
    return { action: { type: 'get_order_status' }, message: 'สถานะออเดอร์' };
  }
  if (data.startsWith('browse_category:')) {
    return { action: { category_id: data.slice('browse_category:'.length), type: 'browse_category' }, message: 'ดูหมวดนี้' };
  }
  if (data.startsWith('select_product:')) {
    return { action: { catalog_key: data.slice('select_product:'.length), type: 'select_product' }, message: 'เลือกสินค้านี้' };
  }
  if (data.startsWith('choose_delivery:')) {
    const rest = data.slice('choose_delivery:'.length);
    const sep = rest.lastIndexOf(':');
    if (sep > 0) {
      const deliveryType = rest.slice(sep + 1) as DeliveryType;
      if (deliveryType in DELIVERY_LABELS) {
        return { action: { delivery_type: deliveryType, type: 'choose_delivery_type' }, message: `เลือก ${DELIVERY_LABELS[deliveryType]}` };
      }
    }
  }
  if (data.startsWith('confirm_order:')) {
    return { action: { type: 'confirm_order' }, message: 'ยืนยันคำสั่งซื้อ' };
  }
  return { action: null, message: data.slice(0, 400) || 'สวัสดี' };
}

export function productFlex(products: PkmProduct[]): LineFlexMessage | null {
  if (products.length === 0) {
    return null;
  }
  return {
    altText: 'สินค้าแนะนำ',
    contents: {
      contents: products.slice(0, 10).map((p) => ({
        body: {
          contents: [
            { size: 'md', text: p.name, type: 'text', weight: 'bold', wrap: true },
            { color: '#4E5F59', margin: 'sm', size: 'sm', text: p.description || ' ', type: 'text', wrap: true },
            { color: BRAND, margin: 'md', size: 'lg', text: baht(p.price_baht), type: 'text', weight: 'bold' },
          ],
          layout: 'vertical',
          type: 'box',
        },
        footer: {
          contents: [{ action: { data: `select_product:${p.catalog_key}`, label: 'เลือก', type: 'postback' }, color: BRAND, style: 'primary', type: 'button' }],
          layout: 'vertical',
          type: 'box',
        },
        hero: p.image_url ? { aspectMode: 'cover', aspectRatio: '20:13', size: 'full', type: 'image', url: p.image_url } : undefined,
        type: 'bubble',
      })),
      type: 'carousel',
    },
    type: 'flex',
  };
}

export function categoryFlex(categories: PkmCategory[]): LineFlexMessage | null {
  if (categories.length === 0) {
    return null;
  }
  return {
    altText: 'หมวดสินค้า',
    contents: {
      contents: categories.slice(0, 10).map((c) => ({
        body: {
          contents: [
            { size: 'md', text: c.name, type: 'text', weight: 'bold', wrap: true },
            { color: '#4E5F59', margin: 'sm', size: 'sm', text: `${c.product_count} รายการ`, type: 'text' },
          ],
          layout: 'vertical',
          type: 'box',
        },
        footer: {
          contents: [{ action: { data: `browse_category:${c.id}`, label: 'ดูสินค้า', type: 'postback' }, color: BRAND, style: 'primary', type: 'button' }],
          layout: 'vertical',
          type: 'box',
        },
        type: 'bubble',
      })),
      type: 'carousel',
    },
    type: 'flex',
  };
}

export function deliveryOptionsFlex(orderId: string, options: { delivery_type: DeliveryType; label: string; fee: number }[]): LineFlexMessage | null {
  if (options.length === 0) {
    return null;
  }
  return {
    altText: 'เลือกวิธีจัดส่ง',
    contents: {
      body: {
        contents: [
          { size: 'md', text: 'เลือกวิธีจัดส่ง', type: 'text', weight: 'bold' },
          ...options.map((o) => ({ color: '#4E5F59', margin: 'sm', size: 'sm', text: `${o.label} — ${baht(o.fee)}`, type: 'text' as const })),
        ],
        layout: 'vertical',
        type: 'box',
      },
      footer: {
        contents: options.map((o) => ({ action: { data: `choose_delivery:${orderId}:${o.delivery_type}`, label: `${o.label} ${baht(o.fee)}`, type: 'postback' }, color: BRAND, style: 'primary', type: 'button' })),
        layout: 'vertical',
        spacing: 'sm',
        type: 'box',
      },
      type: 'bubble',
    },
    type: 'flex',
  };
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'รอชำระเงิน',
  paid: 'ชำระแล้ว',
  confirmed: 'เข้ารอบจัดส่ง',
  packing: 'กำลังแพ็ค',
  packed: 'แพ็คเสร็จแล้ว',
  out_for_delivery: 'รอไรเดอร์ออกส่ง',
  delivering: 'ไรเดอร์กำลังไปส่ง',
  delivered: 'ส่งสำเร็จ',
  returned: 'ตีกลับ',
  awaiting_redelivery_fee: 'รอชำระค่าส่งใหม่',
  cancelled: 'ยกเลิก',
};

export function orderStatusFlex(orders: { order_no: string; status: string; grand_total: number }[]): LineFlexMessage | null {
  if (orders.length === 0) {
    return null;
  }
  return {
    altText: 'สถานะออเดอร์',
    contents: {
      body: {
        contents: [
          { size: 'md', text: 'สถานะออเดอร์ล่าสุด', type: 'text', weight: 'bold' },
          ...orders.slice(0, 5).flatMap((o) => [
            { margin: 'md', size: 'sm', text: o.order_no, type: 'text' as const, weight: 'bold' as const },
            { color: '#4E5F59', size: 'sm', text: `${ORDER_STATUS_LABELS[o.status] ?? o.status} · ${baht(o.grand_total)}`, type: 'text' as const },
          ]),
        ],
        layout: 'vertical',
        type: 'box',
      },
      type: 'bubble',
    },
    type: 'flex',
  };
}

export function paymentFlex(order: NonNullable<PkmOrderPanel>): LineFlexMessage {
  const itemLines = order.items.map((i) => ({ color: '#4E5F59', size: 'sm', text: `${i.name} x${i.qty} — ${baht(i.unit_price * i.qty)}`, type: 'text' as const, wrap: true }));
  return {
    altText: 'ชำระเงิน',
    contents: {
      body: {
        contents: [
          { size: 'md', text: `ออเดอร์ ${order.order_no}`, type: 'text', weight: 'bold' },
          ...itemLines,
          { color: '#8A8F99', margin: 'sm', size: 'xs', text: `ค่าส่ง ${baht(order.delivery_fee)}`, type: 'text' },
          { color: BRAND, margin: 'md', size: 'xl', text: baht(order.grand_total), type: 'text', weight: 'bold' },
          { color: '#8A8F99', margin: 'sm', size: 'xs', text: 'สแกน QR ด้านบนแล้วส่งรูปสลิปในแชทได้เลยค่ะ', type: 'text', wrap: true },
        ],
        layout: 'vertical',
        type: 'box',
      },
      header: {
        backgroundColor: BRAND,
        contents: [{ color: '#FFFFFF', size: 'md', text: 'ชำระเงิน', type: 'text', weight: 'bold' }],
        layout: 'vertical',
        paddingAll: '14px',
        type: 'box',
      },
      type: 'bubble',
    },
    type: 'flex',
  };
}
