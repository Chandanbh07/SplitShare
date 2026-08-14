import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

/**
 * The single Prisma Client instance for the API process.
 *
 * Per AGENTS.md, Prisma is the only sanctioned database access layer,
 * and business logic belongs in `src/services`, not in routes/
 * controllers — those call into services, which call Prisma, not the
 * other way around.
 *
 * Prisma ORM 7 setup notes (schema/models/datasource are unchanged —
 * see prisma/schema.prisma and docs/decisions.md):
 *   - `PrismaClient` is imported from the generated output path
 *     (`prisma/schema.prisma`'s `generator client { output = ... }`),
 *     not from the `@prisma/client` package directly — Prisma 7 no
 *     longer generates into node_modules by default.
 *   - Prisma 7 requires a driver adapter for every database. For
 *     PostgreSQL that's `@prisma/adapter-pg` wrapping the `pg`
 *     driver, constructed with the same `DATABASE_URL` used
 *     elsewhere in this app (see src/config/env.ts) rather than a
 *     second, separate source of truth for the connection string.
 *
 * Constructing `PrismaPg`/`PrismaClient` does not itself open a
 * connection — connections are established lazily on first query —
 * so the server can start (and `/health` can respond) even without a
 * reachable PostgreSQL instance.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
