import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * The Supabase client is created ONLY when the public env vars are present.
 * Without them the app runs in local demo mode (see backend/local-backend).
 * Only the anon (public) key is ever used on the client.
 */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const receiptProcessorUrl = import.meta.env.VITE_RECEIPT_PROCESSOR_URL ?? '';