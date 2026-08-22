import { Router } from "express";
import { healthRouter } from "./health.route.js";
import { meRouter } from "./me.route.js";
import { groupRouter } from "./group.route.js";
import { groupMemberRouter } from "./group-member.route.js";

/**
 * All route modules are mounted here. Further feature routes
 * (expenses, settlements, payments, etc.) will be added to this file
 * as they're implemented.
 */
export const rootRouter = Router();

rootRouter.use(healthRouter);
rootRouter.use(meRouter);
rootRouter.use(groupRouter);
rootRouter.use(groupMemberRouter);
