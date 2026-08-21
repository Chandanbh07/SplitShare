import type { Request, Response } from "express";
import { getOrCreateUserForIdentity } from "../services/user.service.js";

/**
 * GET /api/v1/me
 *
 * Requires `requireAuth` to have run first (mounted in the route),
 * which populates `req.auth`. This controller does no verification
 * itself and never derives identity from anything else on the
 * request — see AGENTS.md "Security".
 *
 * Returns the SplitFlow `User` profile for the caller, creating it
 * on first sign-in if needed (see `../services/user.service.ts`).
 * `supabaseUserId` is intentionally omitted from the response — it's
 * an internal linkage detail, not part of the application profile.
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  // requireAuth guarantees this is set; the check is defense in depth
  // in case this controller is ever wired up without that middleware.
  if (!req.auth) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing or malformed Authorization header." },
    });
    return;
  }

  const user = await getOrCreateUserForIdentity(req.auth);

  res.status(200).json({
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}
