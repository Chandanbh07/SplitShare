import type { Request, Response } from "express";

// Static for now — this foundation doesn't wire up a real release/build
// process yet. Bump manually, or replace with a build-time-injected
// value once one exists.
const APP_VERSION = "0.1.0";

/**
 * GET /health
 *
 * Intentionally does NOT touch the database. This foundation's health
 * check only confirms the process is up and serving requests; a
 * database-dependent readiness check can be added later as a
 * separate endpoint if/when there's a clear reason for one.
 *
 * Never returns secrets or internal configuration values.
 */
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: "ok",
    service: "splitflow-api",
    version: APP_VERSION,
  });
}
