import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resolveCurrentUser } from "../middleware/current-user.middleware.js";
import {
  postGroupMember,
  deleteGroupMember,
  postLeaveGroup,
} from "../controllers/group-member.controller.js";

export const groupMemberRouter = Router();

groupMemberRouter.post(
  "/api/v1/groups/:groupId/members",
  requireAuth,
  resolveCurrentUser,
  postGroupMember
);
groupMemberRouter.delete(
  "/api/v1/groups/:groupId/members/:userId",
  requireAuth,
  resolveCurrentUser,
  deleteGroupMember
);
groupMemberRouter.post(
  "/api/v1/groups/:groupId/leave",
  requireAuth,
  resolveCurrentUser,
  postLeaveGroup
);
