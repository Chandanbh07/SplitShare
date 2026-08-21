import path from "node:path";
import process from "node:process";
import { z } from "zod";

/**
 * Backend environment configuration.
 *
 * This is the ONLY place backend-only secrets are read from
 * `process.env`. Nothing here is ever re-exported to `apps/web` — see
 * AGENTS.md and docs/architecture.md ("Provider secrets are
 * backend-only").
 *
 * Only the variables actually needed by what's implemented so far are
 * marked required. Variables for features that aren't implemented yet
 * (storage, Gemini, Socket.IO CORS) are validated *if present* so a
 * malformed value fails fast, but stay optional. Supabase variables
 * are also optional (see the comment above SUPABASE_URL) even though
 * auth verification uses them, so this app can still start and serve
 * /health without a real Supabase project configured.
 */

// Best-effort local-dev convenience: load a root-level `.env` file if
// one exists, before validating. In production, real environment
// variables are injected by the platform directly and no `.env` file
// needs to exist — so this is wrapped in a try/catch and never throws.
// (Node's built-in `process.loadEnvFile` avoids adding a `dotenv`
// dependency that wasn't in the approved dependency list.)
try {
  const rootEnvPath = path.resolve(process.cwd(), "../../.env");
  process.loadEnvFile(rootEnvPath);
} catch {
  // No .env file found at the expected root path — fine, rely on
  // whatever is already in process.env.
}

// `.env.example` intentionally documents not-yet-configured variables
// as empty strings (e.g. `SUPABASE_URL=""`) rather than omitting them.
// Treat an empty string the same as "not set" for optional variables,
// so copying .env.example to .env doesn't fail validation for
// features that aren't implemented yet.
const optionalString = () =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  // Required: Prisma needs this to construct a client, even though no
  // query is executed as part of this foundation's health check.
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required — see .env.example for the expected format."),

  // Used by Supabase Auth token verification (see
  // src/middleware/auth.middleware.ts). Kept optional rather than
  // required: if unset, the auth middleware treats every request as
  // unauthenticated (401) instead of crashing the server, so
  // /health and the unauthenticated-request path stay testable even
  // without a real Supabase project configured. SUPABASE_ANON_KEY is
  // the key actually used for verification (calling
  // `auth.getUser(token)` against Supabase). SUPABASE_SERVICE_ROLE_KEY
  // isn't used by this minimal verification flow — reserved for
  // future elevated backend operations — but is validated here too
  // since it's a backend-only secret regardless.
  SUPABASE_URL: optionalString(),
  SUPABASE_ANON_KEY: optionalString(),
  SUPABASE_SERVICE_ROLE_KEY: optionalString(),

  // Not used by this foundation (storage/receipts aren't implemented
  // yet).
  STORAGE_PROVIDER: z.enum(["supabase", "s3"]).optional(),
  STORAGE_BUCKET: optionalString(),
  S3_ENDPOINT: optionalString(),
  S3_ACCESS_KEY_ID: optionalString(),
  S3_SECRET_ACCESS_KEY: optionalString(),
  S3_REGION: optionalString(),

  // Not used by this foundation (AI extraction isn't implemented yet,
  // and per AGENTS.md, Gemini must never be part of the financial
  // calculation path regardless).
  GEMINI_API_KEY: optionalString(),

  // Not used by this foundation (Socket.IO isn't wired up yet).
  SOCKET_IO_CORS_ORIGIN: optionalString(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("Invalid backend environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    console.error(
      "See .env.example for the expected variables. Refusing to start with invalid configuration."
    );
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
