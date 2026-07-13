alter table public.products
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text;

alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_payment_status text,
  add column if not exists paid_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_provider_check;

alter table public.orders
  add constraint orders_payment_provider_check
    check (payment_provider is null or payment_provider in ('promptpay', 'stripe'));

create index if not exists products_v2_stripe_price_idx
  on public.products (stripe_price_id)
  where stripe_price_id is not null;

create unique index if not exists orders_v2_stripe_checkout_session_uidx
  on public.orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists orders_v2_payment_provider_status_idx
  on public.orders (tenant_id, payment_provider, status, created_at desc);
