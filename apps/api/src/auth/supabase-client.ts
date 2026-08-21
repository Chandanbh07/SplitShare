import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

/**
 * Server-side Supabase client, used ONLY to verify access tokens on
 * incoming requests (see `../middleware/auth.middleware.ts`) — it
 * never issues tokens, never handles passwords/OTPs directly, and
 * never runs on the frontend. Supabase Auth itself remains
 * responsible for credentials; this backend only verifies what
 * Supabase already authenticated (see docs/architecture.md
 * "Authentication").
 *
 * Constructed with the anon key, which is sufficient for
 * `auth.getUser(token)` — that call simply asks Supabase to validate
 * the JWT and return the identity it belongs to, and does not need
 * the elevated service-role key. Both keys are backend-only
 * regardless (see AGENTS.md); this module never re-exports either to
 * `apps/web`.
 *
 * `undefined` when Supabase isn't configured (no SUPABASE_URL /
 * SUPABASE_ANON_KEY set) — callers must handle that case rather than
 * assuming a client always exists, since this app can run (e.g. for
 * /health) without a real Supabase project configured.
 */
export const supabaseAuthClient: SupabaseClient | undefined =
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY
    ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: {
          // This client only ever verifies tokens issued elsewhere;
          // it must not try to persist/refresh a session of its own.
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : undefined;
