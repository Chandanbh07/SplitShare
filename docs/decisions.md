# SplitFlow — Decisions Log

Record of technology and architecture decisions made so far. New
entries should be appended, not edited in place, so the history of
*why* stays intact. Changing an existing decision requires explicit
approval per `AGENTS.md`.

---

## 2026-08-12 — Initial technology stack

**Decision:** Adopt the following stack for SplitFlow's initial build:

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Query,
  Zustand, Socket.IO client
- **Backend:** Node.js, TypeScript, Express, Prisma, PostgreSQL,
  Socket.IO
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage or S3-compatible object storage
- **AI:** Gemini API (suggestions/extraction only, integrated later)
- **Payments:** UPI (integrated later)

**Rationale:** A monorepo with a clear frontend/backend split lets
the backend stay authoritative for all financial logic while the
frontend focuses on responsiveness and real-time UX. React Query +
Zustand cleanly separate server state from local UI state. Prisma +
PostgreSQL give a strongly-typed, transactional data layer suited to
financial correctness requirements. Supabase covers auth and storage
without building that infrastructure from scratch. Socket.IO covers
both chat and financial-state notifications over one realtime layer.

**Status:** Adopted.

---

## 2026-08-12 — Backend-authoritative architecture

**Decision:** The frontend is never trusted for financial
calculations, permissions, balances, or settlement results. All such
logic is computed and enforced server-side; the frontend only
displays results and may show optimistic UI that reconciles to the
backend's response.

**Rationale:** SplitFlow is a financial application. Trusting the
client for money math or authorization creates both correctness risk
(client bugs corrupting shared financial state) and security risk
(a malicious client manipulating its own balances). Centralizing this
logic in one backend, backed by one database, keeps there being a
single, auditable source of truth.

**Status:** Adopted — see `AGENTS.md` rule 2.

---

## 2026-08-12 — Integer paise for all monetary values

**Decision:** All monetary amounts are represented as integer paise
(₹100.50 = `10050`), never as floating-point numbers, at every layer:
database, API payloads, shared types, and UI state.

**Rationale:** Floating-point arithmetic introduces rounding error
that is unacceptable in a system whose entire purpose is exact debt
tracking and settlement. Integer arithmetic on the smallest currency
unit is the standard, safe approach for financial software.

**Status:** Adopted — see `AGENTS.md` rule 3.

---

## 2026-08-12 — Deterministic, AI-free settlement engine

**Decision:** Settlement calculations are deterministic backend
business logic. AI (Gemini API) is used only for suggestions and
extraction (e.g. receipt parsing, category suggestions) that are
validated by backend logic before being persisted — AI never computes
balances or settlements.

**Rationale:** Settlement is a financial correctness problem, not a
generative one. Determinism makes results explainable, testable, and
reproducible; keeping AI out of the calculation path avoids
introducing non-determinism or hallucination risk into money math.

**Status:** Adopted — see `AGENTS.md` rules 5–6 and `docs/settlement.md`.

---

## 2026-08-12 — Repository initialized, feature work not yet started

**Decision:** This phase only establishes the repository structure
(`apps/`, `packages/`, `prisma/`, `docs/`) and documentation
(`AGENTS.md`, `README.md`, `docs/*.md`). No authentication, APIs, UI,
database migrations, chat, expense, settlement, UPI, or AI
functionality has been implemented. No dependencies have been
installed.

**Rationale:** Per explicit instruction, this task is scoped to
initialization only, so architecture and documentation can be
reviewed before implementation begins.

**Status:** Adopted — implementation phases to be scoped and approved
separately.

---

## 2026-08-12 — V1 product/architecture decisions locked

**Decision:** Reviewed and locked twenty V1-scoping decisions,
recorded in full with rationale in the new `docs/product-decisions.md`.
In summary: INR-only in V1; one payer per expense in V1
(multi-payer is V2); equal and custom splits only in V1; financial
records are never hard-deleted, voiding preserves the original
record; balances are derived from expenses and *confirmed*
settlements, with no balance cache required in V1; settlement
recommendations are deterministic with a defined tie-breaking rule,
and are never described as a guaranteed mathematical minimum unless
the algorithm proves it; `Settlement` (obligation) and `Payment`
(execution/status) are separate entities; UPI remains unimplemented
and its placeholder env-vars were removed until a provider is chosen;
Gemini stays outside the financial calculation path; financial
mutation APIs must be idempotent; `packages/validation` will use Zod;
a service/domain layer is planned between controllers and Prisma; and
all provider secrets (Supabase service role, storage, Gemini, future
UPI) are explicitly backend-only.

**Rationale:** These were previously either implicit, inconsistently
worded across docs, or left as open questions (e.g. multi-payer
timing, balance caching, settlement/payment modelling). Locking them
now — before schema or API implementation begins — avoids rework and
keeps every document consistent about what V1 actually includes.

**Status:** Adopted. This is a documentation/configuration-only pass
— no application code, database models, or dependencies were added.

---

## 2026-08-13 — Settlement/Payment financial model corrected

**Decision:** Clarified and locked, across all docs, that `Settlement`
represents an obligation/recommendation only and never itself changes
a balance. Balances are derived strictly from active expenses and
**confirmed `Payment`** records. Creating a `Settlement` never
automatically creates a `Payment` — they are separate writes/API
calls. Also added `AuditLog` as a planned V1 entity (documentation
only, no Prisma model) to record important financial/group actions
without replacing the underlying financial records.

**Rationale:** Earlier documentation described balances as derived
from "confirmed settlements," which conflated the obligation
(`Settlement`) with its execution (`Payment`) and could have been
read as implying settlement creation resolves a debt. This pass
removes that ambiguity everywhere: `docs/database.md`,
`docs/architecture.md`, `docs/settlement.md`, `docs/api.md`,
`docs/product-decisions.md`, and `AGENTS.md`.

**Status:** Adopted. Documentation/configuration-only — no Prisma
models, application code, or dependencies were added;
`prisma/schema.prisma` remains the existing placeholder.

---

## 2026-08-13 — UPI availability clarified; recommendation vs Settlement separated; partial payments and stale settlements documented

**Decision:** Corrected remaining product copy that implied UPI is
available to users in V1 (it is not — V1 settlement/payment recording
is manual only). Explicitly distinguished three previously-blurred
concepts: a **settlement recommendation** (calculated on demand, not
persisted), a **Settlement** (a persisted obligation, created only by
an explicit user/system action), and a **Payment** (execution/status
against a Settlement) — and locked that a recommendation must never
automatically create a `Settlement`, on top of the existing rule that
a `Settlement` must never automatically create a `Payment`. Added V1
support for **partial payments** (one `Settlement` may have multiple
`Payment` records; sum of confirmed payments must never exceed the
settlement amount; status progresses through `OPEN` /
`PARTIALLY_PAID` / `SETTLED` / `CANCELLED`). Documented the **manual
payment flow** (mark as paid → `PENDING`; recipient confirms →
`CONFIRMED`; only `CONFIRMED` affects balances). Documented **stale
settlement** handling: a `Settlement` may become stale if group
financial state changes before its payment is confirmed, and a stale
settlement or outdated recommendation must never silently override a
freshly computed balance. Added a rule that `AuditLog` `metadata`
must never contain secrets (UPI PINs, passwords, tokens, provider
credentials). Reworded the transaction-atomicity rule from "all
financial operations must run inside database transactions" to "all
financial mutations that modify related financial records execute
atomically inside a database transaction."

**Rationale:** Product copy (`README.md`, `docs/product.md`) still
read as if UPI were an available V1 payment option, which contradicts
the locked "UPI not implemented" decision. Separately, "settlement
recommendation" and "persisted Settlement" had been used almost
interchangeably in places, which risked an implementation where
viewing a recommendation silently wrote a `Settlement` row. Partial
payments and stale-settlement handling were real gaps for a system
that will need to support paying down a debt over multiple
transactions and keep obligations honest as new expenses arrive.

**Status:** Adopted. Documentation/configuration-only — no Prisma
models, application code, or dependencies were added;
`prisma/schema.prisma` remains the existing placeholder. Historical
entries above are left as-is, per process.

---

## 2026-08-19 — V1 authentication + User profile implemented

**Decision:** Implemented the minimum Supabase Auth integration:
`apps/web` authenticates directly against Supabase (email/password
and phone/OTP, via `@supabase/supabase-js` in the browser using the
public anon key) and never routes credentials through SplitFlow's own
backend. `apps/api` verifies the resulting access token on protected
routes via a `requireAuth` middleware that calls
`supabase.auth.getUser(token)` using a server-side Supabase client
(also constructed with the anon key — sufficient for token
verification, no service-role key needed for this). Verified identity
is attached to `req.auth` and is the only source of truth for "who is
calling" — never the request body/query. Added `GET /api/v1/me`,
introducing `/api/v1` as the versioned-endpoint prefix (`/health`
stays unversioned as an operational endpoint). On first authenticated
request from a given Supabase identity, the corresponding `User` row
is created via `prisma.user.upsert` keyed on the existing unique
`supabaseUserId` constraint — atomic and idempotent by construction,
so concurrent first-requests can't create duplicate `User` rows. When
Supabase isn't configured (no `SUPABASE_URL`/`SUPABASE_ANON_KEY`),
`requireAuth` treats every request as unauthenticated (401) rather
than crashing, so `/health` and the unauthenticated-request path stay
testable without a real Supabase project.

**Rationale:** This follows the architecture already locked in
`docs/architecture.md` ("Authentication") and
`docs/product-decisions.md` (backend-authoritative, provider secrets
backend-only) without introducing a new provider or reimplementing
credential handling — Supabase remains the only place passwords/OTPs
ever touch. Using the anon key (not service-role) for verification
follows the principle of least privilege: `getUser()` only needs to
validate a token the caller already holds, not perform elevated
admin operations.

**Status:** Adopted. No Prisma schema changes were needed — the
`User` model's existing `supabaseUserId`/`email`/`phone`/`displayName`
fields were sufficient. `prisma/schema.prisma` is unmodified.
