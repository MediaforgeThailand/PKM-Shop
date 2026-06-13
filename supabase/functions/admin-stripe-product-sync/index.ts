import { resolveAuthUserId, selectOne, updateRows } from '../_shared/db.ts';
import { handleOptions, HttpError, json, toErrorResponse, validateJson, z } from '../_shared/http.ts';
import { createOrUpdateStripeCatalogProduct } from '../_shared/stripe.ts';

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type Embedded<T> = T | T[] | null;

type ProductSyncRow = {
  active: boolean;
  catalog_key: string;
  category: string;
  description: string;
  id: string;
  image_url: string | null;
  name: string;
  price_baht: number;
  requires_appointment: boolean;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  tenant_id: string;
  tenants?: Embedded<{
    display_name: string;
    slug: string;
  }>;
};

type TenantMemberRow = {
  role: string;
};

type AdminStripeProductSyncResponse = {
  price_action: 'created' | 'reused';
  product: ProductSyncRow;
  product_action: 'created' | 'updated';
  stripe_price_id: string;
  stripe_product_id: string;
};

const requestSchema = z.object({
  product_id: z.string().uuid(),
});

const productSelect = [
  'id',
  'tenant_id',
  'catalog_key',
  'name',
  'description',
  'price_baht',
  'category',
  'image_url',
  'requires_appointment',
  'active',
  'stripe_product_id',
  'stripe_price_id',
  'tenants(slug,display_name)',
].join(',');

function embeddedOne<T>(value: Embedded<T>) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

async function requireCatalogAdmin(authUserId: string, tenantId: string) {
  const member = await selectOne<TenantMemberRow>('tenant_members', {
    auth_user_id: `eq.${authUserId}`,
    select: 'role',
    tenant_id: `eq.${tenantId}`,
  });

  if (!member || (member.role !== 'superadmin' && member.role !== 'tenant_admin')) {
    throw new HttpError('VALIDATION', 'Only tenant admins can sync products to Stripe.', 403);
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
    const product = await selectOne<ProductSyncRow>('products', {
      id: `eq.${body.product_id}`,
      select: productSelect,
    });

    if (!product) {
      throw new HttpError('VALIDATION', 'Product not found.', 404);
    }

    await requireCatalogAdmin(authUserId, product.tenant_id);

    if (!Number.isInteger(product.price_baht) || product.price_baht <= 0) {
      throw new HttpError('VALIDATION', 'Product price_baht must be a positive integer before Stripe sync.', 400);
    }

    const tenant = embeddedOne(product.tenants ?? null);
    const syncResult = await createOrUpdateStripeCatalogProduct({
      active: product.active,
      amountBaht: product.price_baht,
      catalogKey: product.catalog_key,
      category: product.category,
      description: product.description,
      imageUrl: product.image_url,
      productId: product.id,
      productName: product.name,
      stripePriceId: product.stripe_price_id,
      stripeProductId: product.stripe_product_id,
      tenantId: product.tenant_id,
    });

    const updatedRows = await updateRows<ProductSyncRow>(
      'products',
      {
        stripe_price_id: syncResult.stripePriceId,
        stripe_product_id: syncResult.stripeProductId,
        updated_at: new Date().toISOString(),
      },
      {
        id: `eq.${product.id}`,
        select: productSelect,
        tenant_id: `eq.${product.tenant_id}`,
      },
    );
    const updatedProduct = updatedRows[0];

    if (!updatedProduct) {
      throw new HttpError('VALIDATION', 'Product sync saved in Stripe but could not update Supabase.', 404);
    }

    return json<AdminStripeProductSyncResponse>({
      price_action: syncResult.priceAction,
      product: {
        ...updatedProduct,
        tenants: updatedProduct.tenants ?? (tenant ? [tenant] : null),
      },
      product_action: syncResult.productAction,
      stripe_price_id: syncResult.stripePriceId,
      stripe_product_id: syncResult.stripeProductId,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
});
