-- Multi-tenant blog platform: tenants, domains and tenant-scoped data.
-- Run after supabase/schema.sql. Safe to run more than once.

create extension if not exists pgcrypto;

-- ── Tenants ─────────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id text primary key,
  owner_user_id text,
  name text not null default 'Untitled blog',
  template_ref text,
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled', 'expired')),
  payment_key text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tenants_payment_key_key
  on public.tenants (payment_key) where payment_key is not null;
create index if not exists tenants_owner_idx on public.tenants (owner_user_id);
create index if not exists tenants_status_idx on public.tenants (status);

-- ── Domains ─────────────────────────────────────────────────────────────────
create table if not exists public.domains (
  id text primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  hostname text not null,
  type text not null check (type in ('platform', 'custom')),
  status text not null default 'pending' check (status in ('pending', 'active', 'failed')),
  verification_token text,
  verified_at timestamptz,
  is_primary boolean not null default false,
  cf_custom_hostname_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists domains_hostname_key on public.domains (lower(hostname));
create index if not exists domains_tenant_idx on public.domains (tenant_id);
create index if not exists domains_resolution_idx on public.domains (lower(hostname), status);

-- Domains are parked (not deleted) when a tenant is suspended.
alter table public.domains drop constraint if exists domains_status_check;
alter table public.domains add constraint domains_status_check
  check (status in ('pending', 'active', 'failed', 'suspended'));

-- At most one primary domain per tenant.
create unique index if not exists domains_one_primary_per_tenant
  on public.domains (tenant_id) where is_primary;

-- ── Subdomain reservations (short-lived holds during checkout) ──────────────
create table if not exists public.domain_reservations (
  hostname text primary key,
  email text,
  checkout_request_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists domain_reservations_expiry_idx on public.domain_reservations (expires_at);

-- ── Per-tenant settings ─────────────────────────────────────────────────────
create table if not exists public.tenant_settings (
  tenant_id text primary key references public.tenants (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Tenant-owned columns on existing tables ─────────────────────────────────
-- Existing rows belong to the platform's own blog.
alter table public.posts add column if not exists tenant_id text not null default 'platform';
alter table public.comments add column if not exists tenant_id text not null default 'platform';
alter table public.categories add column if not exists tenant_id text not null default 'platform';
alter table public.subscriptions add column if not exists tenant_id text not null default 'platform';
alter table public.themes add column if not exists tenant_id text not null default 'platform';
alter table public.analytics_events add column if not exists tenant_id text not null default 'platform';

create index if not exists posts_tenant_date_idx on public.posts (tenant_id, date desc nulls last);
create index if not exists posts_tenant_status_idx on public.posts (tenant_id, is_draft, is_deleted, date desc nulls last);
create index if not exists comments_tenant_post_idx on public.comments (tenant_id, post_id, date desc nulls last);
create index if not exists categories_tenant_idx on public.categories (tenant_id);
create index if not exists subscriptions_tenant_idx on public.subscriptions (tenant_id, lower(email));
create index if not exists themes_tenant_idx on public.themes (tenant_id, year desc, month);
create index if not exists analytics_events_tenant_idx on public.analytics_events (tenant_id, kind, created_at desc);

-- ── Row Level Security (server service-role only) ───────────────────────────
alter table public.tenants enable row level security;
alter table public.domains enable row level security;
alter table public.domain_reservations enable row level security;
alter table public.tenant_settings enable row level security;
