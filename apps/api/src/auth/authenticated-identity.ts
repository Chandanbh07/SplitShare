/**
 * The verified identity of the caller, derived from a Supabase Auth
 * token — never from anything client-supplied (body/query/header
 * other than the token itself). Set by
 * `../middleware/auth.middleware.ts` after successful verification.
 *
 * This is the Supabase identity, not the SplitFlow `User` row —
 * services resolve the corresponding `User` record from
 * `supabaseUserId` (see `../services/user.service.ts`), rather than
 * routes/controllers trusting any user id passed in from outside.
 */
export interface AuthenticatedIdentity {
  supabaseUserId: string;
  email: string | null;
  phone: string | null;
}
