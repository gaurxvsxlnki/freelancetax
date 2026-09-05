-- ============================================================================
-- FreelanceTax — integration user-isolation hardening + webhook idempotency
--
-- Fixes three production issues found in the Phase 3 schema:
--
--  1. `linked_accounts` and `integration_credentials` were unique on
--     (provider, kind, external_account_id) / (provider, provider_item_id)
--     GLOBALLY. An upsert from an edge function could therefore overwrite a
--     row belonging to a DIFFERENT user if two accounts ever resolved to the
--     same provider id. The uniqueness must be scoped per user.
--
--  2. `linked_accounts` had no link back to the provider item whose token is
--     stored in `integration_credentials`. With more than one connected bank
--     the sync/disconnect functions had to guess ("most recent credential"),
--     which could sync or revoke the wrong item. A `provider_item_id` column
--     makes the mapping explicit.
--
--  3. Stripe webhooks had no delivery ledger. Upserts made most handlers
--     naturally idempotent, but replays of `invoice.*` events could still
--     flip a status back and forth. `stripe_webhook_events` records each
--     processed event id exactly once (server-role only, no user policies).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 + 2. linked_accounts
-- ----------------------------------------------------------------------------
alter table public.linked_accounts
  add column if not exists provider_item_id text;

create index if not exists linked_accounts_provider_item_idx
  on public.linked_accounts (user_id, provider, provider_item_id);

-- Replace the globally-scoped unique index with a per-user one.
drop index if exists public.linked_accounts_provider_ext_uniq;
create unique index if not exists linked_accounts_user_provider_ext_uniq
  on public.linked_accounts (user_id, provider, kind, external_account_id)
  where external_account_id is not null;

-- ----------------------------------------------------------------------------
-- 1. integration_credentials — scope uniqueness to the owning user
-- ----------------------------------------------------------------------------
alter table public.integration_credentials
  drop constraint if exists integration_credentials_provider_provider_item_id_key;

create unique index if not exists integration_credentials_user_provider_item_uniq
  on public.integration_credentials (user_id, provider, provider_item_id);

-- ----------------------------------------------------------------------------
-- 3. Stripe webhook delivery ledger (service role only — no RLS policies)
-- ----------------------------------------------------------------------------
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null default '',
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
-- Intentionally no policies: only the service role (the webhook edge function)
-- may read or write this table.

create index if not exists stripe_webhook_events_received_idx
  on public.stripe_webhook_events (received_at desc);

-- ----------------------------------------------------------------------------
-- 4. Make the upsert conflict targets inferrable.
--
-- PostgREST/supabase-js `upsert(..., { onConflict: 'col' })` emits
-- `ON CONFLICT (col)`. Postgres can only infer a PARTIAL unique index when the
-- statement repeats its WHERE predicate, which PostgREST never does — so the
-- Stripe webhook and the transaction importers were upserting against indexes
-- Postgres would refuse ("no unique or exclusion constraint matching the
-- ON CONFLICT specification"). Replace them with full unique indexes; NULLs
-- are still distinct so nullable columns keep working.
-- ----------------------------------------------------------------------------
drop index if exists public.subscriptions_provider_sub_uniq;
create unique index if not exists subscriptions_provider_sub_uniq
  on public.subscriptions (provider_subscription_id);

-- transactions: ensure external_id is never the empty string before making the
-- (account_id, external_id) pair fully unique, otherwise legacy manual rows
-- with '' would collide.
update public.transactions
  set external_id = 'legacy:' || id::text
  where external_id = '' or external_id is null;

alter table public.transactions
  alter column external_id set default '';

drop index if exists public.transactions_account_external_uniq;
create unique index if not exists transactions_account_external_uniq
  on public.transactions (account_id, external_id);

-- ----------------------------------------------------------------------------
-- 5. Align user_is_pro() with the client + edge-function definition.
--
-- src/lib/subscription.ts and supabase/functions/_shared/stripe.ts both grant
-- Pro to a subscription that is `cancelled` with cancel_at_period_end and a
-- future current_period_end (the user already paid for the rest of the term).
-- The database trigger did not, so a cancelling Pro user was hit with Free
-- limits while the UI still showed Pro. All three now agree.
-- ----------------------------------------------------------------------------
create or replace function public.user_is_pro(p_uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_uid
      and plan = 'pro'
      and (
        status in ('active', 'trialing', 'past_due')
        or (
          status = 'cancelled'
          and cancel_at_period_end
          and current_period_end is not null
          and current_period_end > now()
        )
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- 6. Free-plan limits referenced hard-coded numbers in two places.
--    Centralise them so the triggers and the app cannot drift apart.
-- ----------------------------------------------------------------------------
create or replace function public.free_expense_limit()
returns integer language sql immutable as $$ select 20 $$;

create or replace function public.free_receipt_limit()
returns integer language sql immutable as $$ select 5 $$;

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
  if cnt >= public.free_expense_limit() then
    raise exception 'free_expense_limit_reached'
      using errcode = 'P0001', hint = 'Upgrade to Pro for unlimited expense tracking.';
  end if;
  return new;
end;
$$;

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
  if cnt >= public.free_receipt_limit() then
    raise exception 'free_receipt_limit_reached'
      using errcode = 'P0001', hint = 'Upgrade to Pro for unlimited receipt processing.';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Missing INSERT policy on linked_accounts / transactions.
--
-- Both tables are written exclusively by edge functions using the service
-- role (which bypasses RLS), and RLS denies anything without a policy — that
-- is the intended posture and is left unchanged. Documented here so a future
-- reader does not "fix" it by adding a client-side insert policy, which would
-- let a user fabricate connections and imported transactions.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 8. Storage: cap receipt uploads server-side and restrict MIME types. The
--    client also validates, but the bucket is the authoritative limit.
-- ----------------------------------------------------------------------------
update storage.buckets
  set file_size_limit = 10485760, -- 10 MB
      allowed_mime_types = array[
        'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
      ]
  where id = 'receipts';
