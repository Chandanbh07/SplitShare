import { prisma } from "../db/prisma.js";
import type { AuthenticatedIdentity } from "../auth/authenticated-identity.js";
import type { User } from "../generated/prisma/client.js";

/**
 * Derives a reasonable initial `displayName` for a brand-new User
 * record. `displayName` is required (non-nullable) on the `User`
 * model, but Supabase doesn't provide one — so this is a
 * placeholder, editable later via a profile-update endpoint (not
 * part of this task).
 */
function deriveInitialDisplayName(identity: AuthenticatedIdentity): string {
  if (identity.email) {
    return identity.email.split("@")[0] ?? identity.email;
  }
  if (identity.phone) {
    return identity.phone;
  }
  return "New User";
}

/**
 * Returns the SplitFlow `User` record for a verified Supabase
 * identity, creating it on first sign-in if it doesn't exist yet.
 *
 * Idempotent and safe under concurrent calls: keyed on the unique
 * `supabaseUserId` and implemented as a single atomic `upsert`
 * (rather than a separate find-then-create), so two requests
 * arriving at nearly the same moment for a brand-new user can never
 * create two `User` rows — the database's unique constraint on
 * `supabaseUserId` is what actually guarantees this, the upsert just
 * avoids an unnecessary round-trip and a racy read-then-write.
 *
 * On an existing user, this only reads — it does not overwrite
 * `email`/`phone`/`displayName` from the Supabase identity on every
 * request, so any profile edits the user has made in SplitFlow are
 * never silently clobbered by stale Supabase metadata.
 */
export async function getOrCreateUserForIdentity(identity: AuthenticatedIdentity): Promise<User> {
  return prisma.user.upsert({
    where: { supabaseUserId: identity.supabaseUserId },
    update: {},
    create: {
      supabaseUserId: identity.supabaseUserId,
      email: identity.email,
      phone: identity.phone,
      displayName: deriveInitialDisplayName(identity),
    },
  });
}
