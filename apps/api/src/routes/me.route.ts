import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { getMe } from "../controllers/me.controller.js";

export const meRouter = Router();

meRouter.get("/api/v1/me", requireAuth, getMe);
