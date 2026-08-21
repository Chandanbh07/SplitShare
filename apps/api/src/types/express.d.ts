import type { AuthenticatedIdentity } from "../auth/authenticated-identity.js";

/**
 * Augments Express's `Request` with the verified-auth context set by
 * `../middleware/auth.middleware.ts`. Routes/controllers read
 * `req.auth` for the caller's identity — they never trust a user id
 * from the body, query string, or any other client-supplied source
 * (see AGENTS.md "Security").
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required to augment Express's own namespace.
  namespace Express {
    interface Request {
      auth?: AuthenticatedIdentity;
    }
  }
}

export {};
