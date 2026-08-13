# SplitFlow — Architecture

This document describes the planned system architecture. It is a plan,
not an implementation record — nothing described here has been built
yet unless explicitly noted.

## Guiding principles

See `AGENTS.md` for the full, binding list. The two that shape every
decision below:

1. **The backend is authoritative.** The frontend never computes or
   is trusted for balances, splits, permissions, or settlement.
2. **PostgreSQL, accessed through Prisma, is the financial source of
   truth.** Everything else (caches, AI suggestions, client state) is
   derived and disposable.

## High-level shape

```
┌──────────────────────┐        WebSocket (Socket.IO)       ┌──────────────────────┐
│                      │ <---------------------------------> │                      │
│   apps/web           │                                       │   apps/api           │
│   React + TS + Vite  │ ---------------------------------->  │   Node + TS + Express │
│   Tailwind CSS        │        HTTPS (REST, JSON)             │   Socket.IO server    │
│   React Query          │                                     │   Prisma ORM           │
│   Zustand               │                                    │                        │
└──────────────────────┘                                       └──────────┬───────────┘
                                                                            │
                                                          ┌─────────────────┼─────────────────┐
                                                          │                 │                 │
                                                  ┌───────▼──────┐  ┌──────▼──────┐  ┌────────▼───────┐
                                                  │ PostgreSQL   │  │ Supabase     │  │ Gemini API      │
                                                  │ (source of   │  │ Auth /       │  │ (suggestions/   │
                                                  │  truth)      │  │ Storage      │  │  extraction only)│
                                                  └──────────────┘  └──────────────┘  └────────────────┘
```

## Frontend (`apps/web`)

- **React + TypeScript + Vite** for the app shell and build tooling.
- **Tailwind CSS** for styling.
- **React Query** owns server-state: fetching, caching, and
  invalidating data returned by the API. It is the single source of
  truth for "what did the server say," not a place to recompute
  balances or splits.
- **Zustand** owns local/UI state that doesn't belong on the server
  (e.g. active group, open modal, draft expense form state before
  submission).
- **Socket.IO client** subscribes to real-time events (chat messages,
  new/updated expenses, balance changes) and feeds them back into the
  React Query cache rather than maintaining a parallel source of
  truth.
- The frontend may show optimistic UI for responsiveness, but always
  reconciles to the backend's response — it never persists a
  client-computed balance or split as final.

## Backend (`apps/api`)

- **Node.js + TypeScript + Express** for the HTTP API.
- **Prisma** as the only data-access layer against PostgreSQL.
- **Planned service/domain layer** sits between HTTP controllers and
  Prisma: controllers handle request/response concerns (parsing,
  auth context, status codes) and delegate all business rules —
  splitting, balance derivation, settlement recommendation,
  authorization decisions — to domain/service modules. Controllers
  never call Prisma directly for financial logic; this keeps business
  rules unit-testable independent of HTTP and keeps Prisma usage
  centralized and reviewable. Not implemented yet — noted here as a
  locked structural decision for when `apps/api` is scaffolded.
- **Socket.IO server** for real-time chat and live balance/expense
  updates, authorized the same way REST endpoints are — no
  socket event bypasses authorization.
- **Financial mutations that modify related financial records execute
  atomically inside a database transaction** and go through a
  deterministic, server-side calculation layer.
- **Financial mutation endpoints are idempotent.** Create/update
  operations on expenses, settlements, and payments accept a
  client-supplied idempotency key so retried requests (e.g. after a
  network timeout) don't create duplicate financial records. See
  `docs/api.md` for details.
- Authorization middleware enforces group membership and role checks
  on every route/event that touches group or financial data.

### Financial pipeline

Within `apps/api`, the financial flow from a spent expense to an
updated balance passes through distinct stages — deliberately not
collapsed into one step:

```
                Expense Ledger
                      │
                      ▼
                Balance Engine
                      │
                      ▼
             Settlement Engine
                      │
                      ▼
          Settlement recommendation
        (explicit accept/record action)
                      │
                      ▼
             Settlement (persisted)
                      │
                      ▼
                Payment Service
                      │
                      ▼
              Confirmed Payment
                      │
                      ▼
                Balance Engine
```

- **Expense Ledger** — where financial facts (`Expense` +
  `ExpenseParticipant` records) are written.
- **Balance Engine** — deterministic, AI-free logic that computes net
  balances from the ledger's active expenses and confirmed payments.
  It is consulted both to show current balances and as the input to
  settlement recommendation.
- **Settlement Engine** — deterministic, AI-free logic (see
  `docs/settlement.md`) that turns net balances into a **settlement
  recommendation** — a computed suggestion, not persisted by default.
  A `Settlement` (the persisted obligation) is only written when a
  user or system explicitly accepts/records one — the engine
  computing a recommendation never creates a `Settlement` on its own,
  and this step never moves money or alters balances.
- **Payment Service** — handles the execution of a `Settlement`
  (manual confirmation only in V1 — **UPI is not available in V1**,
  it's future scope), producing `Payment` records that progress
  through `PENDING` → `CONFIRMED`/`FAILED`/`CANCELLED`. V1 supports
  **partial payments**: a `Settlement` may have more than one
  `Payment`, and the sum of confirmed payments must never exceed the
  settlement amount. Creating a `Settlement` never automatically
  creates a `Payment` — initiating payment is a separate, later step.
- Only once a `Payment` reaches **`CONFIRMED`** does the Balance
  Engine's next computation reflect it — closing the loop back to
  "Balance Engine" in the diagram above. A `Settlement` whose
  underlying balances have since changed (e.g. a new expense affecting
  the same members) may be **stale**; the pipeline must never let a
  stale settlement silently override a freshly computed balance — see
  "Stale settlements" in `docs/database.md`.

The Balance Engine and Settlement Engine remain deterministic and
independent of AI at every stage of this pipeline.

## Database (PostgreSQL via Prisma)

- PostgreSQL is the financial system of record. See `docs/database.md`
  for the planned entities and relationships (no schema authored yet).
- Monetary values are stored as **integer paise**, never floating
  point. **V1 is INR-only** — no currency field is needed until
  multi-currency becomes in-scope (future).
- **Balances are not cached in V1** — they are computed on read from
  active expense records and **confirmed payment** records only.
  `Settlement` records are not part of the balance calculation — they
  represent obligations/recommendations, not money movement. A cache
  table may be introduced later purely for performance, but the
  system must always be able to recompute balances from the
  underlying records from scratch; the cache would never be the only
  copy of the truth.
- `Settlement` (obligation/recommendation) and `Payment`
  (execution/status) are modelled as **separate entities**; creating
  a `Settlement` never automatically creates a `Payment` — see
  `docs/database.md`.

## Realtime layer

- Socket.IO carries two categories of events: **chat** (messages,
  typing indicators) and **financial-state notifications** (an
  expense was added/edited, balances changed, a settlement was
  recorded).
- Financial-state events are notifications to trigger a refetch/patch
  of authoritative data — the payload is not treated as the source of
  truth on its own; clients reconcile against the REST API's response
  shape.

## Authentication

- **Supabase Auth** is the planned identity provider for email/phone
  authentication. The API validates Supabase-issued tokens on
  incoming requests and sockets; it does not reimplement auth.
- **Supabase service-role credentials are backend-only.** They are
  never sent to, embedded in, or reachable from `apps/web` or any
  other client. Only `apps/api` holds them, via environment
  variables — see `AGENTS.md` and `.env.example`.

## Storage

- Receipt images and similar attachments will live in **Supabase
  Storage or an S3-compatible bucket**, referenced from PostgreSQL by
  URL/key — binary data is not stored in the relational database.
- Storage provider credentials (Supabase service role or S3 access
  keys) are backend-only, for the same reason as above.

## AI integration (Gemini API)

- AI is used only for **suggestions and extraction**: e.g. suggesting
  a category for an expense, or extracting a merchant/amount from a
  receipt image.
- AI output is never persisted directly. It always passes through
  backend validation and normal business-logic paths (e.g. the
  extracted amount still goes through the same integer-paise
  validation as a manually entered amount) before being saved.
- **Gemini is not part of the financial calculation path in any way.**
  It never computes balances, splits, or settlements, and its output
  is never a direct input to those calculations — only to fields
  (category, suggested amount, merchant name) that a human or
  validated business logic subsequently confirms. Its Gemini API key
  is a backend-only credential.
- Gemini API credentials are backend-only, same as Supabase/storage
  credentials above.

## Payments (UPI)

- UPI integration is planned as a **future** settlement-execution
  mechanism: a user would mark a recommended payment as "pay via
  UPI," which generates the appropriate UPI intent/link. SplitFlow
  does not hold funds.
- **UPI is not available in V1, in any part of the user experience.**
  V1's only payment method is manual: the payer marks a payment as
  made, the recipient confirms receipt, recorded on the `Payment`
  entity (see `docs/database.md`). No UPI provider has been selected
  yet, and no UPI credentials exist in `.env.example` until one is.
- When UPI is implemented in a future version, provider credentials
  are backend-only, in line with the rest of this document, and a UPI
  provider confirmation would transition a `Payment` to `CONFIRMED`
  the same way manual confirmation does today — without changing the
  underlying Settlement/Payment model.

## Deployment shape (indicative, not yet decided in detail)

- `apps/web` and `apps/api` are deployable independently (monorepo,
  separate build/deploy targets).
- `packages/types` and `packages/validation` are shared between both
  apps to keep request/response shapes and validation rules in sync
  and avoid drift between frontend and backend assumptions.
- **`packages/validation` will use Zod** as its schema/validation
  library. Request payloads (including financial mutation endpoints)
  are validated against shared Zod schemas before reaching business
  logic, and the same schemas can drive inferred TypeScript types
  consumed by `packages/types`. Not installed yet — this is a planned
  dependency choice, recorded here and in `docs/decisions.md`.
