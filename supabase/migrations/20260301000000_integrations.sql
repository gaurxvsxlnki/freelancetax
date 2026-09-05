-- ============================================================================
-- FreelanceTax — Phase 3: integrations, imported transactions, copilot data
--
-- Design notes:
--  * linked_accounts holds user-visible connection metadata ONLY.
--  * integration_credentials holds provider access tokens; it has NO RLS
--    policies for users — only server-side code (service role) can touch it,
--    and tokens should be encrypted at rest by the syncing edge function.
--  * imported transactions land raw in `transactions` (pending). When the user
--    confirms an item it becomes a normal expenses/income row linked via
--    transaction_id; a partial unique index prevents duplicates.
--  * category_overrides records user corrections so future imports can apply
--    the same categorization.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- linked_accounts
-- ----------------------------------------------------------------------------
create table if not exists public.linked_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('plaid', 'stripe', 'paypal', 'other')),
  kind text not null default 'bank' check (kind in ('bank', 'income')),
  external_account_id text,
  institution_name text not null default '',
  account_name text not null default '',
  account_mask text not null default '',
  status text not null default 'active' check (status in ('active', 'expired', 'disconnected', 'error', 'pending')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists linked_accounts_user_idx on public.linked_accounts (user_id, created_at desc);
create unique index if not exists linked_accounts_provider_ext_uniq
  on public.linked_accounts (provider, kind, external_account_id)
  where external_account_id is not null;

alter table public.linked_accounts enable row level security;

drop policy if exists "linked_accounts_select_own" on public.linked_accounts;
create policy "linked_accounts_select_own"
  on public.linked_accounts for select
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- integration_credentials — server-only; users have no read/write access
-- ----------------------------------------------------------------------------
create table if not exists public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  provider_item_id text not null,
  token_cipher text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_item_id)
);

create index if not exists integration_credentials_user_idx on public.integration_credentials (user_id);
alter table public.integration_credentials enable row level security;
-- Intentionally no user policies: only the service role (edge functions) may
-- read/write tokens.

-- ----------------------------------------------------------------------------
-- transactions — raw imported feed
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.linked_accounts (id) on delete cascade,
  external_id text not null default '',
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'USD',
  merchant text not null default '',
  txn_date date not null,
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  suggested_category text,
  suggested_classification text check (suggested_classification in ('business', 'personal', 'review')),
  category text,
  classification text check (classification in ('business', 'personal', 'review')),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'ignored')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, txn_date desc);
create index if not exists transactions_user_status_idx on public.transactions (user_id, status);
-- Dedupe key: one imported item per (account, external_id).
create unique index if not exists transactions_account_external_uniq
  on public.transactions (account_id, external_id)
  where account_id is not null and external_id <> '';

alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
  on public.transactions for select
  using (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- category_overrides — user corrections that improve future categorization
-- ----------------------------------------------------------------------------
create table if not exists public.category_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_key text not null,
  category text not null,
  classification text not null check (classification in ('business', 'personal', 'review')),
  times_applied integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

alter table public.category_overrides enable row level security;

drop policy if exists "category_overrides_select_own" on public.category_overrides;
create policy "category_overrides_select_own"
  on public.category_overrides for select
  using (auth.uid() = user_id);

drop policy if exists "category_overrides_insert_own" on public.category_overrides;
create policy "category_overrides_insert_own"
  on public.category_overrides for insert
  with check (auth.uid() = user_id);

drop policy if exists "category_overrides_update_own" on public.category_overrides;
create policy "category_overrides_update_own"
  on public.category_overrides for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Link imported items to the expense/income rows they created (dedupe + the
-- "Imported" label). Confirming the same transaction twice is impossible.
-- ----------------------------------------------------------------------------
alter table public.expenses add column if not exists transaction_id uuid
  references public.transactions (id) on delete set null;
alter table public.income add column if not exists transaction_id uuid
  references public.transactions (id) on delete set null;

create unique index if not exists expenses_transaction_uniq
  on public.expenses (transaction_id) where transaction_id is not null;
create unique index if not exists income_transaction_uniq
  on public.income (transaction_id) where transaction_id is not null;

-- ----------------------------------------------------------------------------
-- Alert preferences (in-app alert toggles live on user_prefs)
-- ----------------------------------------------------------------------------
alter table public.user_prefs add column if not exists alerts_missing_receipts boolean not null default true;
alter table public.user_prefs add column if not exists alerts_uncategorized boolean not null default true;
alter table public.user_prefs add column if not exists alerts_reserve boolean not null default true;
alter table public.user_prefs add column if not exists alerts_deadlines boolean not null default true;
