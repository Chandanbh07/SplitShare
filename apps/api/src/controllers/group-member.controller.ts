import type { Request, Response } from "express";
import { parseOrThrow } from "../validation/parse.js";
import {
  addMemberSchema,
  groupIdParamSchema,
  groupMemberParamSchema,
} from "../validation/group.schemas.js";
import { addMember, removeMember, leaveGroup } from "../services/group-member.service.js";
import { HttpError } from "../middleware/error-handler.js";
import type { User } from "../generated/prisma/client.js";

/**
 * requireAuth + resolveCurrentUser (mounted in the route) guarantee
 * `req.currentUser` is set; this throw is defense in depth in case a
 * route is ever wired up without them.
 */
function requireCurrentUser(req: Request): User {
  if (!req.currentUser) {
    throw new HttpError(401, "Missing or malformed Authorization header.", "UNAUTHORIZED");
  }
  return req.currentUser;
}

/**
 * POST /api/v1/groups/:groupId/members
 *
 * OWNER/ADMIN only (enforced in the service against the actor's real
 * membership row). Looks the target user up by `userId` or verified
 * `phone` — never creates an auth account, the user must already
 * exist in SplitFlow.
 */
export async function postGroupMember(req: Request, res: Response): Promise<void> {
  const { groupId } = parseOrThrow(groupIdParamSchema, req.params);
  const input = parseOrThrow(addMemberSchema, req.body);
  const currentUser = requireCurrentUser(req);

  const member = await addMember(currentUser.id, groupId, input);
  res.status(201).json(member);
}

/**
 * DELETE /api/v1/groups/:groupId/members/:userId
 *
 * Removes another member (OWNER/ADMIN only — see the service for the
 * exact role rules). Never physically deletes the row — status
 * becomes REMOVED.
 */
export async function deleteGroupMember(req: Request, res: Response): Promise<void> {
  const { groupId, userId } = parseOrThrow(groupMemberParamSchema, req.params);
  const currentUser = requireCurrentUser(req);

  await removeMember(currentUser.id, groupId, userId);
  res.status(200).json({ userId, status: "REMOVED" });
}

/**
 * POST /api/v1/groups/:groupId/leave
 *
 * Voluntary self-removal. Never physically deletes the row — status
 * becomes LEFT.
 */
export async function postLeaveGroup(req: Request, res: Response): Promise<void> {
  const { groupId } = parseOrThrow(groupIdParamSchema, req.params);
  const currentUser = requireCurrentUser(req);

  await leaveGroup(currentUser.id, groupId);
  res.status(200).json({ status: "LEFT" });
}
