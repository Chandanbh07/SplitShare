import { prisma } from "../db/prisma.js";
import { HttpError } from "../middleware/error-handler.js";
import { requireActiveMembership } from "./group-access.service.js";
import type { GroupMemberSummary } from "./group.service.js";
import type { GroupRole, User } from "../generated/prisma/client.js";

export interface AddMemberInput {
  userId?: string;
  phone?: string;
}

function assertCanManageMembers(actorRole: GroupRole): void {
  if (actorRole !== "OWNER" && actorRole !== "ADMIN") {
    throw new HttpError(403, "Only the group owner or an admin can manage members.", "FORBIDDEN");
  }
}

/**
 * OWNER can remove ADMIN or MEMBER. ADMIN can only remove MEMBER —
 * not another ADMIN, and never the OWNER. (See AGENTS.md/this
 * milestone's Roles rules: "ADMIN ... cannot remove/demote the
 * OWNER" and manages only normal members.)
 */
function assertCanRemove(actorRole: GroupRole, targetRole: GroupRole): void {
  if (targetRole === "OWNER") {
    throw new HttpError(403, "The group owner cannot be removed.", "FORBIDDEN");
  }
  if (actorRole === "OWNER") {
    return;
  }
  if (actorRole === "ADMIN") {
    if (targetRole === "ADMIN") {
      throw new HttpError(403, "Admins cannot remove other admins.", "FORBIDDEN");
    }
    return;
  }
  throw new HttpError(403, "Only the group owner or an admin can manage members.", "FORBIDDEN");
}

async function resolveTargetUser(input: AddMemberInput): Promise<User> {
  // addMemberSchema's `.refine` already guarantees exactly one of
  // userId/phone is present before a controller calls this.
  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId } })
    : input.phone
      ? await prisma.user.findUnique({ where: { phone: input.phone } })
      : null;

  if (!user) {
    throw new HttpError(404, "User not found.", "NOT_FOUND");
  }
  return user;
}

/**
 * Adds an existing SplitFlow user to a group. Only OWNER/ADMIN may
 * call this (checked against the actor's real, server-verified
 * membership row — never a role the client claims).
 *
 *   - Already ACTIVE            -> 409 conflict, no duplicate row.
 *   - Previously LEFT/REMOVED   -> the existing GroupMember row is
 *     reactivated (status -> ACTIVE) rather than creating a second
 *     row for the same (groupId, userId) pair — the unique
 *     constraint on that pair means a second row isn't possible
 *     anyway, but reactivating is also what preserves the original
 *     membership history/joinedAt instead of discarding it.
 *     Reactivation always resets role to MEMBER — it never silently
 *     restores a previous ADMIN role.
 *   - No existing row           -> a new ACTIVE MEMBER row is created.
 *
 * Also writes a minimal "added to group" Notification row — no
 * delivery mechanism, just a record the recipient can read later
 * (see this milestone's scope: no notification service yet).
 */
export async function addMember(
  actorUserId: string,
  groupId: string,
  input: AddMemberInput
): Promise<GroupMemberSummary> {
  const actorMembership = await requireActiveMembership(groupId, actorUserId);
  assertCanManageMembers(actorMembership.role);

  const targetUser = await resolveTargetUser(input);

  const membership = await prisma.$transaction(async (tx) => {
    const existing = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUser.id } },
    });

    if (existing?.status === "ACTIVE") {
      throw new HttpError(409, "This user is already a member of the group.", "CONFLICT");
    }

    const result = existing
      ? await tx.groupMember.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", role: "MEMBER" },
        })
      : await tx.groupMember.create({
          data: { groupId, userId: targetUser.id, role: "MEMBER", status: "ACTIVE" },
        });

    const group = await tx.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { name: true },
    });

    await tx.notification.create({
      data: {
        userId: targetUser.id,
        type: "GROUP_MEMBER_ADDED",
        title: "Added to a group",
        body: `You were added to "${group.name}".`,
        data: { groupId },
      },
    });

    return result;
  });

  return {
    userId: membership.userId,
    displayName: targetUser.displayName,
    avatarUrl: targetUser.avatarUrl,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt,
  };
}

/**
 * Removes another member (OWNER/ADMIN only — see `assertCanRemove`).
 * Never physically deletes the row: status becomes REMOVED, per the
 * product decision that membership history is preserved (see
 * docs/database.md).
 *
 * Rejects self-removal — use `leaveGroup` instead, which is the
 * voluntary path and has its own rules (e.g. the owner can't leave).
 */
export async function removeMember(actorUserId: string, groupId: string, targetUserId: string): Promise<void> {
  const actorMembership = await requireActiveMembership(groupId, actorUserId);

  if (targetUserId === actorUserId) {
    throw new HttpError(
      400,
      "Use POST /api/v1/groups/:groupId/leave to remove yourself.",
      "VALIDATION_ERROR"
    );
  }

  const targetMembership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });

  if (!targetMembership || targetMembership.status !== "ACTIVE") {
    throw new HttpError(404, "Active membership not found.", "NOT_FOUND");
  }

  assertCanRemove(actorMembership.role, targetMembership.role);

  await prisma.groupMember.update({
    where: { id: targetMembership.id },
    data: { status: "REMOVED" },
  });
}

/**
 * Voluntary self-removal. Never physically deletes the row: status
 * becomes LEFT.
 *
 * The OWNER cannot leave via this milestone's implementation —
 * ownership transfer isn't built yet, and leaving would orphan the
 * group. This is a deliberate, minimal limitation rather than
 * inventing a transfer-of-ownership flow that wasn't asked for.
 */
export async function leaveGroup(userId: string, groupId: string): Promise<void> {
  const membership = await requireActiveMembership(groupId, userId);

  if (membership.role === "OWNER") {
    throw new HttpError(
      400,
      "The group owner cannot leave the group. Ownership transfer is not implemented yet.",
      "VALIDATION_ERROR"
    );
  }

  await prisma.groupMember.update({
    where: { id: membership.id },
    data: { status: "LEFT" },
  });
}
