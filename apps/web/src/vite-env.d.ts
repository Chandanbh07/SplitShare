/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Supabase project URL — safe to expose to the browser. */
  readonly VITE_SUPABASE_URL?: string;
  /** Public Supabase anon key — safe to expose to the browser. Never
   * put the service-role key in a VITE_ variable; that stays
   * backend-only (see AGENTS.md). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Base URL of the SplitFlow API. Defaults to localhost:4000 if unset. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
