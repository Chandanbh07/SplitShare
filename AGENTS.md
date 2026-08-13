# AGENTS.md — Permanent Engineering Rules for SplitFlow

These rules apply to every contributor, human or AI, working in this
repository. They are not suggestions — they encode the non-negotiable
architectural and safety guarantees of a financial application. If a
task seems to require breaking one of these rules, stop and ask for
explicit approval rather than proceeding.

## 1. Language & type safety

- TypeScript **strict mode** is required across every package and app
  (`"strict": true` in `tsconfig.json`).
- **Never use `any`.** Use precise types, generics, `unknown` with
  narrowing, or shared types from `packages/types`. If a third-party
  type is genuinely unknowable, isolate it behind a well-typed adapter
  rather than letting `any` leak into application code.

## 2. Backend-authoritative architecture

- The frontend is **never** trusted for financial calculations,
  permissions, balances, or settlement results.
- All such logic lives on the backend. The frontend may display
  optimistic UI, but the backend's response is always the source of
  truth and the UI must reconcile to it.

## 3. Money handling

- **Never use floating-point numbers for money.**
- All monetary amounts are represented as **integer paise**
  (₹100.50 = `10050`). This applies to storage, calculation, APIs,
  and shared types — no exceptions and no "just this once" use of
  decimals or floats for currency.

## 4. Data & persistence

- **PostgreSQL is the financial source of truth.**
- **Prisma** is the only sanctioned database access layer for the API.
- Between HTTP controllers and Prisma sits a **planned service/domain
  layer**: controllers never call Prisma directly for financial
  logic — business rules live in domain/service modules. See
  `docs/architecture.md`.
- Expense records are the source of truth for money spent. A
  **settlement recommendation** (computed on demand from current
  balances) is normally **not persisted** and never automatically
  becomes a `Settlement`. `Settlement` (persisted obligation) and
  `Payment` (execution/status) records — kept as **separate
  entities**, see `docs/database.md` — are also source-of-truth
  financial records, but only in what they each represent: a
  `Settlement` records an obligation, a `Payment` records its
  execution. **Balances are derived only from active expenses and
  confirmed payments** — `Settlement` records (and recommendations)
  do not themselves change balances. **A balance cache is not required
  in V1**; if one is added later purely for performance, the system
  must still always be able to recompute balances from scratch from
  the underlying financial records.
- **A settlement recommendation must never automatically create a
  Settlement.** Computing/showing a recommendation is a read-only
  operation; a `Settlement` is written only via an explicit user or
  system action.
- **Creating a Settlement must never automatically create a
  Payment.** They are separate writes: recording an obligation is one
  action; initiating or confirming payment against it is a distinct,
  later action. Do not implement or document a flow where
  `createSettlement()` produces both records.
- **V1 supports partial payments.** One `Settlement` may have
  multiple `Payment` records. The sum of confirmed payments for a
  `Settlement` must never exceed the `Settlement` amount; the
  remaining amount is derived (`settlement.amount − Σ confirmed
  payments`), never stored independently.
- **A `Settlement` may become stale** if relevant group financial
  state changes after it was created and before its payments are
  confirmed. Never let a stale settlement or an outdated recommendation
  silently override a freshly computed balance — see "Stale
  settlements" in `docs/database.md`.
- **Financial records are never hard-deleted.** Cancelling or voiding
  an expense, settlement, or payment preserves the original record
  and marks it (e.g. a `voided` status) rather than removing or
  overwriting it.
- **Financial mutations that modify related financial records execute
  atomically inside a database transaction.** Partial writes to
  financial state are not acceptable.
- **Financial mutation endpoints must be idempotent** (accept and
  honor a client-supplied idempotency key) so retried requests never
  create duplicate financial records. See `docs/api.md`.
- **V1 is INR-only.** Do not add currency fields, conversion logic, or
  multi-currency handling without an explicit decision to do so.
- **V1 supports exactly one payer per expense.** Multi-payer expenses
  are V2 — do not implement them under the assumption they're "the
  same thing, just generalized."
- **V1 supports equal and custom splits only.**

## 5. Settlement engine

- Settlement calculations must be **deterministic**, including a
  **defined, documented tie-breaking rule** for cases where more than
  one valid plan ties on transaction count. No randomness, no
  reliance on AI-generated numbers.
- **A Settlement does not alter balances.** It represents a persisted
  obligation only (and a settlement recommendation, being unpersisted,
  even less so). **Only a confirmed Payment reduces an outstanding
  balance** — pending, failed, or cancelled payments do not, and
  neither does an `OPEN`/unpaid `Settlement` on its own.
- **Settlement and Payment are separate concepts and separate
  records**, never conflated into one. See `docs/database.md` and
  rule 4 above.
- **Never claim a mathematical global minimum** for settlement
  transaction count unless the implemented algorithm specifically
  guarantees it. Default language everywhere (code comments, API
  docs, product copy) is "reduced"/"optimized," not "minimum" or
  "fewest possible." See `docs/settlement.md`.
- **AI must never calculate financial balances or settlements.** AI
  may only produce suggestions or extractions (e.g. categorization,
  receipt parsing) that are validated by backend business logic
  before being persisted. AI output is never trusted as-is, and no
  AI-derived value is ever a direct input to a balance or settlement
  calculation.

## 6. Authorization & security

- **Backend authorization is required** on every endpoint and every
  socket event that touches user or financial data. Never rely on the
  client to hide or gate access.
- Never expose sensitive user information unnecessarily (e.g. don't
  return full profile/contact data in list endpoints that don't need
  it).
- **Never commit secrets.** All credentials and API keys are supplied
  via environment variables (see `.env.example` for the expected
  shape) and must never be hardcoded or checked into git.
- **Provider secrets are backend-only.** Supabase service-role keys,
  storage access keys, the Gemini API key, and any future
  payment-provider (UPI) credentials live exclusively in `apps/api`'s
  environment. They must never be sent to, bundled into, or reachable
  from `apps/web` or any other client.
- **UPI is not available in V1.** V1 settlement/payment recording is
  manual only. No UPI provider has been selected; do not add UPI
  credential handling, provider SDKs, payment initiation code, or any
  UPI-facing UI/copy implying availability until that decision is made
  and recorded in `docs/decisions.md`.

## 7. Auditability

- **No silent financial mutations.** Any change to balances,
  expenses, settlements, or payments must be traceable to an explicit
  user action or system process, and should be recorded in a way that
  supports auditing later (e.g. created/updated timestamps, actor
  attribution, immutable history of financial records rather than
  destructive overwrites).
- **AuditLog records important financial/group actions** (e.g.
  expense created/updated/voided, settlement created, payment
  created/confirmed/failed, membership changes) — see
  `docs/database.md` for planned fields. It is planned for V1 but
  documentation-only for now: do not create its Prisma model until
  that phase is explicitly scoped. AuditLog is an audit trail
  alongside the financial records — it never replaces `Expense`,
  `Settlement`, or `Payment` as the source of truth for what
  happened.
- **AuditLog metadata must never contain secrets** — UPI PINs,
  passwords, authentication/session tokens, API keys, or any other
  provider secret. Log that an action happened and non-sensitive
  context only.

## 8. Testing

- Financial and business logic (splitting, balance calculation,
  settlement optimization, authorization checks) must have automated
  tests. Do not merge untested changes to this logic.

## 9. Scope discipline

- **Do not modify unrelated code** while working on a specific task.
  Keep diffs focused.
- **Do not introduce new dependencies without justification.** If a
  library is genuinely needed, explain why in the PR/commit and
  prefer the smallest well-maintained option consistent with the
  existing stack. **Zod** is the one pre-approved addition, planned
  for `packages/validation` (see `docs/architecture.md` and
  `docs/decisions.md`) — it does not need re-justifying when it is
  actually installed.
- **Do not replace or restructure existing architecture** (chosen
  stack, folder layout, core patterns) **without explicit approval.**
  Propose changes in `docs/decisions.md` and get sign-off first.

## 10. Process

- Work in the smallest reasonable increments. Don't build features
  that weren't asked for "while you're in there."
- When a task's instructions say to stop at a certain point (e.g.
  "initialize the repo, don't build features yet"), stop there and
  report status rather than continuing automatically.
