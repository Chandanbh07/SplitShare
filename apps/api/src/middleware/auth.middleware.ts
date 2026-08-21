import type { NextFunction, Request, Response } from "express";
import { supabaseAuthClient } from "../auth/supabase-client.js";
import type { AuthenticatedIdentity } from "../auth/authenticated-identity.js";

const BEARER_PREFIX = "Bearer ";

let warnedSupabaseNotConfigured = false;

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return undefined;
  }
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : undefined;
}

function unauthorized(res: Response, message: string): void {
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message,
    },
  });
}

/**
 * Verifies the caller's Supabase Auth access token and attaches the
 * resulting identity to `req.auth`. Mount on any route that requires
 * an authenticated caller.
 *
 * Security notes (see AGENTS.md):
 *   - The identity comes ONLY from the verified token — never from
 *     the request body, query string, or any other client-supplied
 *     field.
 *   - The token itself is never logged, not even on failure.
 *   - If Supabase isn't configured (no SUPABASE_URL/ANON_KEY), every
 *     request is treated as unauthenticated (401) rather than the
 *     server crashing or silently trusting the caller — this keeps
 *     /health and the unauthenticated-request path testable without
 *     a real Supabase project.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);

  if (!token) {
    unauthorized(res, "Missing or malformed Authorization header.");
    return;
  }

  if (!supabaseAuthClient) {
    if (!warnedSupabaseNotConfigured) {
      console.warn(
        "Supabase Auth is not configured (SUPABASE_URL / SUPABASE_ANON_KEY are unset) — " +
          "all authenticated requests will be rejected with 401 until it is."
      );
      warnedSupabaseNotConfigured = true;
    }
    unauthorized(res, "Authentication is not available.");
    return;
  }

  const { data, error } = await supabaseAuthClient.auth.getUser(token);

  // Never log `token`, `error` details that might echo it, or the
  // raw Supabase response — only that verification failed.
  if (error || !data.user) {
    unauthorized(res, "Invalid or expired session.");
    return;
  }

  const identity: AuthenticatedIdentity = {
    supabaseUserId: data.user.id,
    email: data.user.email ?? null,
    phone: data.user.phone ?? null,
  };

  req.auth = identity;
  next();
}
