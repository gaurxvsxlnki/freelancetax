-- ============================================================================
-- FreelanceTax — initial schema
-- Tables, Row Level Security, Storage policies, and triggers.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- helpers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  full_name text not null default '',
  freelancer_type text not null default 'Freelancer',
  state text not null default '',
  annual_income_range text not null default '',
  works_from_home boolean not null default false,
  business_use_percentage integer not null default 0 check (business_use_percentage between 0 and 100),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_user_id_idx on public.profiles (user_id);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a user signs up so onboarding always has
-- somewhere to write.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  insert into public.user_prefs (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- user_prefs
-- ----------------------------------------------------------------------------
create table if not exists public.user_prefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  tax_year integer not null default extract(year from now()),
  currency text not null default 'USD',
  email_reminders boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

drop policy if exists "user_prefs_select_own" on public.user_prefs;
create policy "user_prefs_select_own"
  on public.user_prefs for select
  using (auth.uid() = user_id);

drop policy if exists "user_prefs_insert_own" on public.user_prefs;
create policy "user_prefs_insert_own"
  on public.user_prefs for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_prefs_update_own" on public.user_prefs;
create policy "user_prefs_update_own"
  on public.user_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger user_prefs_set_updated_at
  before update on public.user_prefs
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- income
-- ----------------------------------------------------------------------------
create table if not exists public.income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  source text not null default '',
  income_date date not null,
  category text not null default 'Freelance',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists income_user_date_idx on public.income (user_id, income_date desc);
create index if not exists income_category_idx on public.income (category);

alter table public.income enable row level security;

drop policy if exists "income_select_own" on public.income;
create policy "income_select_own"
  on public.income for select
  using (auth.uid() = user_id);

drop policy if exists "income_insert_own" on public.income;
create policy "income_insert_own"
  on public.income for insert
  with check (auth.uid() = user_id);

drop policy if exists "income_update_own" on public.income;
create policy "income_update_own"
  on public.income for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "income_delete_own" on public.income;
create policy "income_delete_own"
  on public.income for delete
  using (auth.uid() = user_id);

create trigger income_set_updated_at
  before update on public.income
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- receipts
-- ----------------------------------------------------------------------------
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_path text not null,
  file_name text not null default '',
  file_type text not null default '',
  file_size integer not null default 0,
  merchant text not null default '',
  amount numeric(12,2),
  receipt_date date,
  extracted_text text,
  processing_status text not null default 'processing'
    check (processing_status in ('uploading', 'processing', 'needs_review', 'completed', 'failed')),
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receipts_user_created_idx on public.receipts (user_id, created_at desc);

alter table public.receipts enable row level security;

drop policy if exists "receipts_select_own" on public.receipts;
create policy "receipts_select_own"
  on public.receipts for select
  using (auth.uid() = user_id);

drop policy if exists "receipts_insert_own" on public.receipts;
create policy "receipts_insert_own"
  on public.receipts for insert
  with check (auth.uid() = user_id);

drop policy if exists "receipts_update_own" on public.receipts;
create policy "receipts_update_own"
  on public.receipts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "receipts_delete_own" on public.receipts;
create policy "receipts_delete_own"
  on public.receipts for delete
  using (auth.uid() = user_id);

create trigger receipts_set_updated_at
  before update on public.receipts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- expenses
-- ----------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  merchant text not null default '',
  expense_date date not null,
  category text not null default 'Other',
  business_use_percentage integer not null default 100 check (business_use_percentage between 0 and 100),
  is_business_expense boolean not null default true,
  notes text,
  receipt_id uuid references public.receipts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_user_date_idx on public.expenses (user_id, expense_date desc);
create index if not exists expenses_category_idx on public.expenses (category);

alter table public.expenses enable row level security;

drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own"
  on public.expenses for select
  using (auth.uid() = user_id);

drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own"
  on public.expenses for insert
  with check (auth.uid() = user_id);

drop policy if exists "expenses_update_own" on public.expenses;
create policy "expenses_update_own"
  on public.expenses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "expenses_delete_own" on public.expenses;
create policy "expenses_delete_own"
  on public.expenses for delete
  using (auth.uid() = user_id);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- deduction_insights (persisted store for server/AI-generated insights;
-- the client heuristic engine can also persist here)
-- ----------------------------------------------------------------------------
create table if not exists public.deduction_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expense_id uuid not null references public.expenses (id) on delete cascade,
  classification text not null check (classification in ('business', 'personal', 'review')),
  confidence text not null default 'Medium',
  explanation text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists deduction_insights_user_idx on public.deduction_insights (user_id);
create unique index if not exists deduction_insights_expense_uniq on public.deduction_insights (expense_id);

alter table public.deduction_insights enable row level security;

drop policy if exists "insights_select_own" on public.deduction_insights;
create policy "insights_select_own"
  on public.deduction_insights for select
  using (auth.uid() = user_id);

drop policy if exists "insights_insert_own" on public.deduction_insights;
create policy "insights_insert_own"
  on public.deduction_insights for insert
  with check (auth.uid() = user_id);

drop policy if exists "insights_delete_own" on public.deduction_insights;
create policy "insights_delete_own"
  on public.deduction_insights for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- tax_payments — recorded estimated-tax payments and set-asides (bookkeeping
-- only; no actual payments are made from the app)
-- ----------------------------------------------------------------------------
create table if not exists public.tax_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  payment_date date not null,
  kind text not null default 'set_aside' check (kind in ('set_aside', 'estimated_payment')),
  tax_year integer not null,
  quarter_key text, -- e.g. '2026-Q1'
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists tax_payments_user_year_idx on public.tax_payments (user_id, tax_year desc);

alter table public.tax_payments enable row level security;

drop policy if exists "tax_payments_select_own" on public.tax_payments;
create policy "tax_payments_select_own"
  on public.tax_payments for select
  using (auth.uid() = user_id);

drop policy if exists "tax_payments_insert_own" on public.tax_payments;
create policy "tax_payments_insert_own"
  on public.tax_payments for insert
  with check (auth.uid() = user_id);

drop policy if exists "tax_payments_delete_own" on public.tax_payments;
create policy "tax_payments_delete_own"
  on public.tax_payments for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- tax_estimates — persisted snapshots of the on-the-fly estimate, one per
-- user + tax year, so the history of estimates is kept and the schema matches
-- the product spec
-- ----------------------------------------------------------------------------
create table if not exists public.tax_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tax_year integer not null,
  total_income numeric(12,2) not null default 0,
  total_expenses numeric(12,2) not null default 0,
  estimated_tax numeric(12,2) not null default 0,
  recommended_set_aside numeric(12,2) not null default 0,
  calculation_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tax_year)
);

create index if not exists tax_estimates_user_year_idx on public.tax_estimates (user_id, tax_year desc);

alter table public.tax_estimates enable row level security;

drop policy if exists "tax_estimates_select_own" on public.tax_estimates;
create policy "tax_estimates_select_own"
  on public.tax_estimates for select
  using (auth.uid() = user_id);

drop policy if exists "tax_estimates_insert_own" on public.tax_estimates;
create policy "tax_estimates_insert_own"
  on public.tax_estimates for insert
  with check (auth.uid() = user_id);

drop policy if exists "tax_estimates_update_own" on public.tax_estimates;
create policy "tax_estimates_update_own"
  on public.tax_estimates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tax_estimates_delete_own" on public.tax_estimates;
create policy "tax_estimates_delete_own"
  on public.tax_estimates for delete
  using (auth.uid() = user_id);

create trigger tax_estimates_set_updated_at
  before update on public.tax_estimates
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Storage: private 'receipts' bucket with per-user folders
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Files live at receipts/<user_id>/<filename>. Policies only ever see the
-- current user's own folder.
drop policy if exists "receipts_storage_select" on storage.objects;
create policy "receipts_storage_select"
  on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_storage_insert" on storage.objects;
create policy "receipts_storage_insert"
  on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_storage_update" on storage.objects;
create policy "receipts_storage_update"
  on storage.objects for update
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "receipts_storage_delete" on storage.objects;
create policy "receipts_storage_delete"
  on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- indexes on commonly filtered values
-- ----------------------------------------------------------------------------
create index if not exists income_amount_idx on public.income (amount);
create index if not exists expenses_amount_idx on public.expenses (amount);
