import { Router } from "express";
import { healthRouter } from "./health.route.js";

/**
 * All route modules are mounted here. Feature routes (groups,
 * expenses, settlements, payments, etc.) will be added to this file
 * as they're implemented — none exist yet in this foundation.
 */
export const rootRouter = Router();

rootRouter.use(healthRouter);
