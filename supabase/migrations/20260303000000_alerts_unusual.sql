-- Phase 3 gaps: preference toggle for the unusual-spending dashboard alert.

alter table public.user_prefs
  add column if not exists alerts_unusual_spending boolean not null default true;
