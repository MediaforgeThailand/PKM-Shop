import { z } from './http.ts';

export const referrerOrderRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_order'),
    branch_id: z.string().uuid().optional(),
    buyer_age: z.number().int().min(1).max(120),
    buyer_name: z.string().trim().min(2),
    buyer_phone: z.string().regex(/^0[689]\d{8}$/),
    catalog_key: z.string().min(1),
    preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    tenant_slug: z.string().regex(/^[a-z0-9-]{2,32}$/),
  }),
  z.object({
    action: z.literal('list_branches'),
    catalog_key: z.string().min(1),
    tenant_slug: z.string().regex(/^[a-z0-9-]{2,32}$/),
  }),
  z.object({
    action: z.literal('payment_done'),
    order_id: z.string().uuid(),
    tenant_slug: z.string().regex(/^[a-z0-9-]{2,32}$/),
  }),
]);
