import type { Request, Response } from "express";
import { parseOrThrow } from "../validation/parse.js";
import { createGroupSchema, groupIdParamSchema } from "../validation/group.schemas.js";
import { createGroup, listMyGroups, getGroupDetails } from "../services/group.service.js";
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
 * POST /api/v1/groups
 *
 * The owner is always the resolved current user — never anything
 * from the request body (see AGENTS.md "Security").
 */
export async function postGroup(req: Request, res: Response): Promise<void> {
  const input = parseOrThrow(createGroupSchema, req.body);
  const currentUser = requireCurrentUser(req);

  const group = await createGroup(currentUser.id, input);
  res.status(201).json(group);
}

/**
 * GET /api/v1/groups
 *
 * Groups where the caller currently has an ACTIVE membership.
 */
export async function getMyGroups(req: Request, res: Response): Promise<void> {
  const currentUser = requireCurrentUser(req);

  const groups = await listMyGroups(currentUser.id);
  res.status(200).json({ groups });
}

/**
 * GET /api/v1/groups/:groupId
 *
 * 404s (via the service) if the caller isn't an active member —
 * never distinguishes "doesn't exist" from "you can't see it".
 */
export async function getGroup(req: Request, res: Response): Promise<void> {
  const { groupId } = parseOrThrow(groupIdParamSchema, req.params);
  const currentUser = requireCurrentUser(req);

  const details = await getGroupDetails(currentUser.id, groupId);
  res.status(200).json(details);
}
