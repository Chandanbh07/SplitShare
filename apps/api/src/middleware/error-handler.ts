import type { NextFunction, Request, Response } from "express";

/**
 * A known, intentional HTTP error a route/service can throw. Anything
 * else caught by `errorHandler` is treated as an unexpected internal
 * error and never leaks its details to the client.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "ERROR") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Not found.",
    },
  });
}

/**
 * Centralized error handler. Must be registered last, after all
 * routes and other middleware.
 *
 * Never includes a stack trace or any secret/config value in the
 * response — only a stable error code and a safe message. In
 * non-production environments a short `detail` field is included to
 * speed up local debugging.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express requires 4 params to recognize error middleware.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const isProduction = process.env.NODE_ENV === "production";

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // Unexpected error: log full detail server-side, but never expose
  // stack traces or internals in the response body.
  console.error(err);

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong.",
      ...(isProduction
        ? {}
        : { detail: err instanceof Error ? err.message : String(err) }),
    },
  });
}
