import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resolveCurrentUser } from "../middleware/current-user.middleware.js";
import { postGroup, getMyGroups, getGroup } from "../controllers/group.controller.js";

export const groupRouter = Router();

groupRouter.post("/api/v1/groups", requireAuth, resolveCurrentUser, postGroup);
groupRouter.get("/api/v1/groups", requireAuth, resolveCurrentUser, getMyGroups);
groupRouter.get("/api/v1/groups/:groupId", requireAuth, resolveCurrentUser, getGroup);
