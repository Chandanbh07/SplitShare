import { prisma } from "../db/prisma.js";
import { requireActiveMembership } from "./group-access.service.js";
import type { GroupRole, GroupMemberStatus } from "../generated/prisma/client.js";

export interface CreateGroupInput {
  name: string;
  description?: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  role: GroupRole;
  memberCount: number;
  createdAt: Date;
}

export interface GroupMemberSummary {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: GroupRole;
  status: GroupMemberStatus;
  joinedAt: Date;
}

export interface GroupDetails {
  id: string;
  name: string;
  description: string | null;
  chatMode: string;
  createdAt: Date;
  updatedAt: Date;
  myRole: GroupRole;
  members: GroupMemberSummary[];
}

/**
 * Creates a group and makes `ownerId` its OWNER, atomically — a
 * group must never exist without its initial membership row, and
 * vice versa (see AGENTS.md "Data & persistence" on atomic financial
 * mutations; this isn't a financial mutation, but the same
 * all-or-nothing requirement applies to this pair of related
 * records).
 *
 * `ownerId` must already be the authenticated caller's own SplitFlow
 * user id — callers must never accept an owner/user id from the
 * request body (see AGENTS.md "Security").
 */
export async function createGroup(ownerId: string, input: CreateGroupInput): Promise<GroupSummary> {
  const group = await prisma.$transaction(async (tx) => {
    const created = await tx.group.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        ownerId,
        // chatMode defaults to EVERYONE per the schema; no override here.
      },
    });

    await tx.groupMember.create({
      data: {
        groupId: created.id,
        userId: ownerId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    return created;
  });

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    role: "OWNER",
    memberCount: 1,
    createdAt: group.createdAt,
  };
}

/**
 * Groups where `userId` currently has an ACTIVE membership. Groups
 * the user has left or been removed from are never included — this
 * query filters on membership status, not just "some membership row
 * exists."
 */
export async function listMyGroups(userId: string): Promise<GroupSummary[]> {
  const memberships = await prisma.groupMember.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      group: {
        include: {
          _count: { select: { members: { where: { status: "ACTIVE" } } } },
        },
      },
    },
    orderBy: { group: { createdAt: "desc" } },
  });

  return memberships.map((membership) => ({
    id: membership.group.id,
    name: membership.group.name,
    description: membership.group.description,
    role: membership.role,
    memberCount: membership.group._count.members,
    createdAt: membership.group.createdAt,
  }));
}

/**
 * Full details for a single group, including active members. Throws
 * a 404 (via `requireActiveMembership`) if the caller isn't an
 * active member — a non-member gets the same response whether the
 * group exists or not, so group existence isn't leaked.
 */
export async function getGroupDetails(userId: string, groupId: string): Promise<GroupDetails> {
  const membership = await requireActiveMembership(groupId, userId);

  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: { user: true },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    chatMode: group.chatMode,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    myRole: membership.role,
    members: group.members.map((member) => ({
      userId: member.userId,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      status: member.status,
      joinedAt: member.joinedAt,
    })),
  };
}
