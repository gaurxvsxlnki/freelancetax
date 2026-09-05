import { supabaseConfigured } from '../lib/supabase';
import type { FinanceBackend } from './types';
import { SupabaseBackend } from './supabase-backend';
import { LocalBackend } from './local-backend';

let instance: FinanceBackend | null = null;

/** The active data layer. Supabase when configured, local demo otherwise. */
export function getBackend(): FinanceBackend {
  if (!instance) {
    instance = supabaseConfigured ? new SupabaseBackend() : new LocalBackend();
  }
  return instance;
}