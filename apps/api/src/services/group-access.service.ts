import { prisma } from "../db/prisma.js";
import { HttpError } from "../middleware/error-handler.js";
import type { GroupMember } from "../generated/prisma/client.js";

/**
 * Returns the caller's ACTIVE `GroupMember` row for a group, or
 * throws a 404. This is the one place every group-scoped
 * endpoint should go through to confirm access — access is always
 * based on the authenticated identity's real membership row, never
 * on anything the client claims (see AGENTS.md "Security").
 *
 * Deliberately 404 (not 403) whether the group doesn't exist at all
 * or the caller simply isn't an active member of it, so a non-member
 * can't use this endpoint to learn whether a given group id exists.
 */
export async function requireActiveMembership(groupId: string, userId: string): Promise<GroupMember> {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new HttpError(404, "Group not found.", "NOT_FOUND");
  }

  return membership;
}
