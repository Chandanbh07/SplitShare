import type { NextFunction, Request, Response } from "express";
import { getOrCreateUserForIdentity } from "../services/user.service.js";

/**
 * Resolves the caller's SplitFlow `User` record from their verified
 * Supabase identity and attaches it to `req.currentUser`. Must be
 * mounted AFTER `./auth.middleware.ts`'s `requireAuth`, which sets
 * `req.auth`.
 *
 * Group/member endpoints operate on SplitFlow user ids (`Group.ownerId`,
 * `GroupMember.userId`, etc.), not the Supabase identity directly, so
 * this is the one place that translation happens for those routes —
 * reusing the same idempotent get-or-create logic `GET /api/v1/me`
 * already relies on (see `../services/user.service.ts`).
 */
export async function resolveCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) {
    // Defense in depth: requireAuth should already have rejected the
    // request before this middleware ever runs.
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing or malformed Authorization header." },
    });
    return;
  }

  req.currentUser = await getOrCreateUserForIdentity(req.auth);
  next();
}
