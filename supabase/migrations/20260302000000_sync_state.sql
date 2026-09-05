-- Phase 3: incremental sync state for Plaid cursor-based transaction sync.
-- Applied after 20260301000000_integrations.sql.

alter table public.linked_accounts
  add column if not exists sync_cursor text;

create index if not exists linked_accounts_user_active_idx
  on public.linked_accounts (user_id, status);
