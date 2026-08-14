import path from "node:path";
import process from "node:process";
import { defineConfig } from "prisma/config";

/**
 * Prisma ORM 7 configuration for the Prisma CLI.
 *
 * As of Prisma 7, the CLI (schema validation, `generate`, migrations)
 * no longer reads environment variables automatically and loads its
 * connection URL from this file rather than from `datasource.url` in
 * `prisma/schema.prisma` — see docs/decisions.md for the Prisma 7
 * compatibility notes. The schema's `datasource`/`model` definitions
 * themselves are unchanged; this file only tells the *CLI* where to
 * find `DATABASE_URL`.
 *
 * Deliberately reads `process.env.DATABASE_URL` directly (not the
 * throwing `env()` helper from `prisma/config`) so commands like
 * `prisma generate` still work for type-checking purposes even when
 * no database is configured yet, per Prisma's own 7.2.0 guidance.
 */

// Best-effort local-dev convenience, mirroring
// apps/api/src/config/env.ts: load a root-level `.env` if present.
// No `dotenv` dependency needed — Node's built-in loader is enough.
try {
  process.loadEnvFile(path.resolve(__dirname, ".env"));
} catch {
  // No .env file present — rely on whatever is already in process.env.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
