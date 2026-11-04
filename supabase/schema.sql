-- Birthday Blog — Supabase schema
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Design notes:
--  * Each table keeps the app's original JSON document in `data` so the API
--    response shapes do not change during the migration.
--  * Frequently filtered/sorted fields are mirrored into real columns for
--    indexing. The application always writes both from the same object.
--  * RLS is enabled with no policies. Only the server's service_role key can
--    read/write these tables; browser clients cannot query them directly.

create extension if not exists pgcrypto;

-- ── Users ───────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id text primary key,
  username text not null,
  email text,
  role text not null default 'ADMIN',
  active boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_username_lower_key on public.users (lower(username));
create index if not exists users_email_idx on public.users (lower(email));

-- ── Posts ───────────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id text primary key,
  date timestamptz,
  is_draft boolean not null default false,
  is_deleted boolean not null default false,
  author_username text,
  tags text[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_date_idx on public.posts (date desc nulls last);
create index if not exists posts_status_date_idx on public.posts (is_draft, is_deleted, date desc nulls last);
create index if not exists posts_tags_idx on public.posts using gin (tags);
create index if not exists posts_author_idx on public.posts (author_username);

-- Atomic like/dislike counter update. Postgres-side so concurrent readers and
-- writers cannot lose counts (the JSON fallback rewrites the whole array).
create or replace function public.adjust_post_counter(p_id text, p_field text, p_delta integer)
returns integer
language plpgsql
as $$
declare
  v_value integer;
begin
  if p_field not in ('likes', 'dislikes') then
    raise exception 'invalid counter field: %', p_field;
  end if;

  update public.posts
     set data = jsonb_set(
           coalesce(data, '{}'::jsonb),
           array[p_field],
           to_jsonb(greatest(0, coalesce((data->>p_field)::int, 0) + p_delta))
         ),
         updated_at = now()
   where id = p_id
   returning coalesce((data->>p_field)::int, 0) into v_value;

  return v_value;
end;
$$;

-- ── Comments ────────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id text primary key,
  post_id text,
  date timestamptz,
  approved boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists comments_post_date_idx on public.comments (post_id, date desc nulls last);

-- ── Categories ──────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Newsletter subscriptions ────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id text primary key,
  email text,
  post_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_email_idx on public.subscriptions (lower(email));

-- ── Monthly themes ──────────────────────────────────────────────────────────
create table if not exists public.themes (
  id text primary key,
  month text,
  year integer,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists themes_year_month_idx on public.themes (year desc, month);

-- ── Template buyers ─────────────────────────────────────────────────────────
create table if not exists public.template_buyers (
  id text primary key,
  email text,
  license_key text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists template_buyers_email_idx on public.template_buyers (lower(email));
create unique index if not exists template_buyers_license_key_key on public.template_buyers (license_key);

-- ── Template applications ───────────────────────────────────────────────────
create table if not exists public.template_applications (
  id text primary key,
  email text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── MPesa transactions ──────────────────────────────────────────────────────
create table if not exists public.mpesa_transactions (
  id text primary key,
  checkout_request_id text,
  status text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mpesa_checkout_request_idx on public.mpesa_transactions (checkout_request_id);

-- ── Typed settings (single `app` row holds the whole settings object) ───────
create table if not exists public.settings (
  type text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Single-document app state: about, security logs, reset tokens ───────────
create table if not exists public.app_state (
  key text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Analytics events (append-only, index-friendly) ──────────────────────────
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('page_view', 'post_view', 'interaction')),
  page text,
  post_id text,
  interaction_type text,
  target text,
  value text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_kind_created_idx on public.analytics_events (kind, created_at desc);
create index if not exists analytics_events_created_idx on public.analytics_events (created_at desc);

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.users enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.categories enable row level security;
alter table public.subscriptions enable row level security;
alter table public.themes enable row level security;
alter table public.template_buyers enable row level security;
alter table public.template_applications enable row level security;
alter table public.mpesa_transactions enable row level security;
alter table public.settings enable row level security;
alter table public.app_state enable row level security;
alter table public.analytics_events enable row level security;

-- ── Storage bucket ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read access for uploads" on storage.objects;
create policy "Public read access for uploads"
  on storage.objects for select
  using (bucket_id = 'uploads');
