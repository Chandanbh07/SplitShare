import type { AuthenticatedIdentity } from "../auth/authenticated-identity.js";
import type { User } from "../generated/prisma/client.js";

/**
 * Augments Express's `Request` with:
 *   - `auth`: the verified Supabase identity, set by
 *     `../middleware/auth.middleware.ts`.
 *   - `currentUser`: the corresponding SplitFlow `User` row, set by
 *     `../middleware/current-user.middleware.ts` (which must run
 *     after `auth.middleware.ts`) for routes that need it.
 *
 * Routes/controllers read these for the caller's identity — they
 * never trust a user id from the body, query string, or any other
 * client-supplied source (see AGENTS.md "Security").
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required to augment Express's own namespace.
  namespace Express {
    interface Request {
      auth?: AuthenticatedIdentity;
      currentUser?: User;
    }
  }
}

export {};
