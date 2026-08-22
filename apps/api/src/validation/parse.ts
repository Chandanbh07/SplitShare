import type { ZodType } from "zod";
import { HttpError } from "../middleware/error-handler.js";

/**
 * Parses `data` against `schema`, throwing the same structured
 * `HttpError` the rest of the app already uses (see
 * `../middleware/error-handler.ts`) on failure, so validation errors
 * come back as a normal 400 JSON error rather than a raw Zod error.
 */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new HttpError(400, message, "VALIDATION_ERROR");
  }
  return result.data;
}
