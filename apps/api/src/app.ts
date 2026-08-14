import express, { type Express } from "express";
import { rootRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

/**
 * Builds the Express application. Kept separate from `server.ts` so
 * the app can be constructed (e.g. for tests) without binding a port.
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.use(rootRouter);

  // Must be registered last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
