-- Stripe Connect + payments infrastructure for the platform fee model.
-- Three tables, all client_id-scoped (text slug, e.g. 'flex-facility') so
-- this is multi-tenant ready from day one. RLS enabled; service_role
-- bypasses RLS, and both portals query via the service role key — so no
-- explicit per-row policies needed. Existing tables on this database
-- (connect_payments, products, sales — used by other tenants) are NOT
-- touched.
--
-- Applied to bnkoqybkmwtrlorhowyv on 2026-05-13 via Supabase MCP.

create table if not exists public.stripe_connect_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null default 'flex-facility',
  stripe_account_id text unique not null,
  account_status text default 'pending',
  onboarding_complete boolean default false,
  charges_enabled boolean default false,
  payouts_enabled boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_connect_accounts_client_idx
  on public.stripe_connect_accounts (client_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id text not null default 'flex-facility',
  stripe_payment_intent_id text unique,
  stripe_account_id text,
  product_type text not null,
  product_name text,
  list_price_cents integer not null,
  transaction_fee_cents integer not null,
  customer_total_cents integer not null,
  platform_fee_cents integer not null,
  platform_fee_pct numeric default 0.07,
  currency text default 'usd',
  customer_name text,
  customer_email text,
  customer_phone text,
  size text,
  color text,
  status text not null default 'pending',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_client_created_idx
  on public.orders (client_id, created_at desc);
create index if not exists orders_status_idx
  on public.orders (status);

create table if not exists public.platform_fees (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  client_id text not null default 'flex-facility',
  stripe_transfer_id text,
  fee_amount_cents integer not null,
  fee_pct numeric not null,
  go_elev8_stripe_account text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists platform_fees_client_created_idx
  on public.platform_fees (client_id, created_at desc);

alter table public.stripe_connect_accounts enable row level security;
alter table public.orders enable row level security;
alter table public.platform_fees enable row level security;
