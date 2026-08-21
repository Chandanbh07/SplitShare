import { Router } from "express";
import { healthRouter } from "./health.route.js";
import { meRouter } from "./me.route.js";

/**
 * All route modules are mounted here. Further feature routes
 * (groups, expenses, settlements, payments, etc.) will be added to
 * this file as they're implemented.
 */
export const rootRouter = Router();

rootRouter.use(healthRouter);
rootRouter.use(meRouter);
