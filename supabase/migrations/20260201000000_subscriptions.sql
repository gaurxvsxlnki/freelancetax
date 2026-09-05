-- ============================================================================
-- FreelanceTax — Phase 2: subscriptions, entitlement, and usage limits
--
-- The subscriptions table is written ONLY by server-side code (Stripe
-- webhooks via an Edge Function using the service-role key). Users can read
-- their own row; absence of a row means the user is on the Free plan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- subscriptions
-- ----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe', 'demo')),
  provider_customer_id text,
  provider_subscription_id text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  billing_interval text check (billing_interval in ('month', 'year')),
  status text not null default 'incomplete'
    check (status in ('active', 'trialing', 'past_due', 'cancelled', 'expired', 'incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
-- Idempotency: a provider subscription id maps to at most one row.
create unique index if not exists subscriptions_provider_sub_uniq
  on public.subscriptions (provider_subscription_id)
  where provider_subscription_id is not null;

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Service-role writes (webhooks / billing edge functions) bypass RLS; users
-- never insert/update/delete their own subscription rows from the client.

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Entitlement helpers
-- ----------------------------------------------------------------------------

-- True when the user holds an effective Pro subscription (grace periods such
-- as past_due still count as Pro so access is not cut off mid-billing-cycle).
create or replace function public.user_is_pro(p_uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_uid
      and plan = 'pro'
      and status in ('active', 'trialing', 'past_due')
  );
$$;

-- ----------------------------------------------------------------------------
-- Server-side Free-plan limits
--
-- These triggers are the authoritative enforcement. The client UI is only a
-- courtesy; bypassing it (e.g. calling PostgREST directly) still hits the
-- database rule. Limits reset each calendar month because they count rows
-- created inside the current month.
-- ----------------------------------------------------------------------------

create or replace function public.enforce_free_expense_limit()
returns trigger
language plpgsql
as $$
declare
  cnt integer;
begin
  if public.user_is_pro(new.user_id) then
    return new;
  end if;
  select count(*) into cnt
  from public.expenses
  where user_id = new.user_id
    and date_trunc('month', created_at) = date_trunc('month', now());
  if cnt >= 20 then
    raise exception 'free_expense_limit_reached'
      using errcode = 'P0001', hint = 'Upgrade to Pro for unlimited expense tracking.';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_free_limit on public.expenses;
create trigger expenses_free_limit
  before insert on public.expenses
  for each row execute function public.enforce_free_expense_limit();

create or replace function public.enforce_free_receipt_limit()
returns trigger
language plpgsql
as $$
declare
  cnt integer;
begin
  if public.user_is_pro(new.user_id) then
    return new;
  end if;
  select count(*) into cnt
  from public.receipts
  where user_id = new.user_id
    and date_trunc('month', created_at) = date_trunc('month', now());
  if cnt >= 5 then
    raise exception 'free_receipt_limit_reached'
      using errcode = 'P0001', hint = 'Upgrade to Pro for unlimited receipt processing.';
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_free_limit on public.receipts;
create trigger receipts_free_limit
  before insert on public.receipts
  for each row execute function public.enforce_free_receipt_limit();
