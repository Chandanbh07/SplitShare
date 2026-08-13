# SplitFlow — Locked V1 Product Decisions

This document is the single source of truth for what is **locked** for
V1. Where other docs (`product.md`, `architecture.md`, `database.md`,
`settlement.md`, `api.md`) describe the same ground, they should agree
with this file — if they ever drift, this file wins until it is
itself explicitly revised (see `docs/decisions.md` for how decisions
get changed).

Each entry states the decision and why it's locked. These are
deliberately conservative, correctness-first choices for a financial
product's first version.

## 1. Currency — INR only

V1 supports **INR only**. There is no currency field or conversion
logic anywhere in V1 — every amount is implicitly INR, stored as
integer paise. Multi-currency support (foreign-currency expenses,
conversion, per-group or per-expense currency) is explicitly **future
scope**, not V1, and will require its own design pass before it's
added.

## 2. One payer per expense

V1 supports **exactly one payer per expense** — the single member who
fronted the cost. Multi-payer expenses (more than one person fronting
a single expense) are **V2 scope**. Do not model or implement them as
"the same thing, generalized" — they carry additional split-of-payment
complexity that's deliberately deferred.

## 3. Equal and custom splits

V1 supports **equal splits** and **custom splits** (an explicit
per-participant paise amount entered at creation time). No other
split strategies (percentage-based, share/weight-based, etc.) are in
scope for V1.

## 4. Multi-payer expenses are V2

Restated for clarity alongside #2: multi-payer support is explicitly
deferred to V2, not implicitly assumed to arrive "later in V1."

## 5. Financial records are never hard-deleted

`Expense`, `Settlement`, and `Payment` records are never removed from
the database. This is required for auditability and for balances to
always be reconstructable from history.

## 6. Voiding/cancellation preserves the original record

Cancelling or correcting a financial record is modelled as a status
change (e.g. `voided`) on the original row — never an overwrite or
deletion. The original values remain queryable. A correcting entry
may be created alongside it where appropriate, but the original is
never lost.

## 7. Balances are derived from active expenses and confirmed payments

Balances are derived from active expenses and confirmed payments.
Settlement records represent obligations/recommendations and do not
independently change balances. Pending, failed, cancelled, or
unconfirmed payments do not reduce balances.

Concretely: balance state ("who owes whom how much") is always
computed from `Expense` + `ExpenseParticipant` records together with
**confirmed `Payment`** records only — `Settlement` records, and
settlement recommendations (which aren't even persisted — see #11),
are excluded from the calculation entirely. Balances are never an
independently-entered or independently-trusted value.

## 8. Balance cache is not required in V1

Balances are computed on read in V1 — there is no materialized/cached
balance table. A cache may be introduced later purely for read
performance, but it is not a V1 requirement, and even if added, the
system must always be able to recompute balances from scratch from
the underlying financial records.

## 9. Settlement recommendations are deterministic, with a defined tie-breaking rule

The same set of balances must always produce the same recommended
settlement plan. This includes a **documented tie-breaking rule** for
cases where multiple valid payment plans tie on transaction count
(e.g. a stable ordering by user ID or another consistent key). The
exact rule is pinned down when the algorithm is implemented, but the
requirement that one exists and is documented is locked now.

## 10. Do not claim a mathematical global minimum unless guaranteed

Minimizing transaction count for arbitrary debt settlement is NP-hard
in the general case. SplitFlow's product copy, API docs, and code
comments describe settlement recommendations as "reduced" or
"optimized" — **never** as "the minimum" or "the fewest possible"
number of payments — unless and until the implemented algorithm
specifically guarantees that property for the cases it handles.

## 11. Settlement recommendation, Settlement, and Payment are three distinct concepts

- **Settlement recommendation** = calculated on demand from current
  balances by the settlement engine, and **normally not persisted**.
- **Settlement** = a **persisted obligation**, created only when a
  user explicitly records/accepts a settlement (e.g. "C owes A ₹100,"
  `status: OPEN`). A Settlement does not itself represent money
  movement and does not itself change any balance.
- **Payment** = the actual execution against a Settlement, including
  its status. A confirmed Payment against a Settlement is what
  reduces the outstanding balance.

These are kept as separate concepts throughout the documentation and,
later, the data model — never collapsed into one record or implied to
be interchangeable.

## 12. A recommendation must not automatically create a Settlement; a Settlement must not automatically create a Payment

Computing or displaying a settlement recommendation is a read-only
operation and must **not** automatically create a `Settlement`
record — a `Settlement` is created only through an explicit user or
system action.

Separately, `createSettlement()` produces a `Settlement` only. It
never also creates a `Payment`. Initiating or recording payment
against that settlement is a distinct, later action (a separate
function/API call) that produces the `Payment` record.

This double separation is intentional: it keeps "the engine's
suggestion," "what is owed," and "what has been done about it" as
three independently auditable steps, and prevents a recommendation or
an unpaid obligation from silently being treated as settled.

## 13. V1 supports partial payments

One `Settlement` may have multiple `Payment` records. The sum of
**confirmed** payments for a `Settlement` must never exceed the
`Settlement` amount. The remaining settlement amount is derived as
`settlement amount − confirmed payments`, not stored independently.
`Settlement` status reflects this progression — e.g. `OPEN` (no
confirmed payments yet), `PARTIALLY_PAID` (some but not all),
`SETTLED` (fully paid), or `CANCELLED` — exact enum names to be
finalized during schema design.

## 14. Stale settlements must never silently override current balances

A `Settlement` represents the balance state/obligation at the time it
was created. If relevant group financial state changes before its
payment is confirmed, the `Settlement` may become stale and require
recalculation. The system must never let an outdated settlement
recommendation, or a stale `Settlement`, silently override a freshly
computed balance — current balances (expenses + confirmed payments)
are always the ground truth. Exact stale-state detection/handling is
left to schema design.

## 15. Manual payment flow in V1

V1's payment flow is manual, in two steps: (1) the paying member
marks a payment as made, creating a `Payment` in `PENDING` status;
(2) the recipient confirms receipt, transitioning it to `CONFIRMED`.
Only `CONFIRMED` payments affect balances — `PENDING`, `FAILED`, and
`CANCELLED` payments do not. A future UPI provider confirmation could
independently transition a `Payment` to `CONFIRMED` without changing
this flow's model.

## 16. UPI is not available in V1

No UPI provider has been selected. **V1's settlement/payment recording
is manual only** — UPI is not available anywhere in the V1 user
experience, and no UPI SDK, provider integration, or payment-initiation
code exists yet. UPI remains future scope.

## 17. No placeholder UPI credentials in `.env.example`

`.env.example` does not declare `UPI_*` variables until a real
provider is selected — placeholder variable names imply a decision
that hasn't been made. Once a provider is chosen, its required
variables will be added (as backend-only secrets).

## 18. Gemini is not part of the financial calculation path

The Gemini API is used only for suggestions and extraction (expense
categorization, receipt parsing). Its output is never a direct input
to a balance, split, or settlement calculation — it always passes
through backend validation and normal business-logic paths first.

## 19. V1 is INR-only; multi-currency is future scope

Restated for clarity alongside #1: this applies across product
messaging, API payloads, and the data model — no currency dimension
should be added speculatively.

## 20. Idempotency for financial mutation APIs

Financial mutation endpoints (create/edit an expense, record a
settlement, record a payment) accept a client-supplied idempotency
key. A retried request with the same key returns the original result
rather than creating a duplicate financial record.

## 21. Zod as the planned validation library

`packages/validation` will use **Zod** for schema validation, shared
between `apps/web` and `apps/api`. This is the one dependency
pre-approved ahead of the usual "justify new dependencies" rule in
`AGENTS.md`. Not installed yet.

## 22. Planned service/domain layer

A service/domain layer sits between HTTP controllers and Prisma in
`apps/api`. Controllers handle request/response concerns; all
business rules (splitting, balance derivation, settlement
recommendation, authorization decisions) live in domain/service
modules, which are the only code that calls Prisma for financial
logic. Not implemented yet — locked as a structural decision for when
`apps/api` is scaffolded.

## 23. This document exists

`docs/product-decisions.md` (this file) is the canonical record of
locked V1 decisions, referenced from `product.md`, `architecture.md`,
`database.md`, `settlement.md`, `api.md`, and `AGENTS.md` rather than
each of them re-deriving the same conclusions independently.

## 24. Provider secrets are backend-only

Supabase service-role credentials, storage access keys, the Gemini
API key, and any future UPI provider credentials are backend-only.
They live exclusively in `apps/api`'s environment and must never be
sent to, bundled into, or reachable from `apps/web` or any other
client. Only non-secret, publishable values (e.g. a Supabase anon key
meant for client use) may ever reach the frontend, configured
separately from backend secrets.

## 25. AuditLog is a planned V1 entity, documentation-only for now

An `AuditLog` entity is planned for V1 to record important actions
affecting groups and financial records (see `docs/database.md` for
fields and example actions). It is an audit trail, not a financial
record — it never replaces `Expense`, `Settlement`, or `Payment` as
the source of truth for what happened financially, and no Prisma
model is being authored for it in this phase.

## 26. AuditLog metadata must never contain secrets

`AuditLog` `metadata` must never contain UPI PINs, passwords,
authentication or session tokens, API keys, or any other provider
secret. AuditLog exists to record that an action happened, along with
relevant non-sensitive context (amounts, entity IDs, status
transitions) — never credentials. This applies regardless of payment
method, including once UPI is implemented.
