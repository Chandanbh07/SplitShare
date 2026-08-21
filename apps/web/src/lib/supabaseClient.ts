import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Browser-side Supabase client, used directly by this page for
 * signup/login/OTP/logout — per docs/architecture.md, SplitFlow's
 * backend does not reimplement authentication, so the client talks
 * to Supabase Auth itself and only sends the resulting access token
 * to our API (see `./api.ts`).
 *
 * `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are PUBLIC values by
 * design — Supabase's anon key is meant to be shipped to clients.
 * Never put a service-role key in a `VITE_` variable; that stays
 * backend-only (see AGENTS.md).
 *
 * `null` when unconfigured, so the UI can show a clear setup message
 * instead of crashing.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
