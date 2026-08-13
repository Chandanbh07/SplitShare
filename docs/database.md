# SplitFlow — Database

This document describes the **planned** entities and relationships for
SplitFlow. It is intentionally a design narrative, not a schema — the
actual `prisma/schema.prisma` will be authored in a later phase once
this design has been reviewed.

## Core principles (see `AGENTS.md` for the binding versions)

- PostgreSQL is the financial source of truth.
- All monetary fields are **integer paise** (no `Float`/`Decimal`
  used loosely for currency — the exact numeric type will be pinned
  down when the schema is authored, but it will never be a
  floating-point type).
- **V1 is INR-only.** There is no currency field/dimension in V1 —
  every amount is implicitly INR paise. Multi-currency support is
  future scope and will require an explicit design pass (currency
  code per group/expense, conversion handling, etc.) before it is
  added.
- Expenses and **confirmed payments** are the source of truth;
  balances are always derived from them, never stored as the primary
  record. `Settlement` records (and settlement recommendations) do
  **not** themselves alter balances — see "Financial model: Settlement
  Recommendation, Settlement, Payment" below. See
  `docs/product-decisions.md` for the locked decision that a balance
  cache is **not required in V1** — balances are computed on read.
- **All financial mutations that modify related financial records
  execute atomically inside a database transaction.**
- **Financial records are never hard-deleted.** Cancelling or voiding
  an expense, settlement, or payment preserves the original record
  and adds a status/void marker rather than removing or overwriting
  the row. See "Voiding & cancellation" below.
- **Financial actions are logged to an audit trail.** See `AuditLog`
  below — it records that actions happened, it does not replace the
  actual financial records.

## Financial model: Settlement Recommendation, Settlement, Payment

This is the authoritative model for how money is tracked. **Four**
concepts, deliberately kept distinct — note that a settlement
*recommendation* and a persisted `Settlement` record are not the same
thing:

- **`Expense`** — a financial **fact**: money that was actually spent
  (and by whom, split how). This is a source-of-truth financial
  record.
- **Settlement recommendation** — **not a persisted entity.**
  Calculated on demand from current balances by the settlement engine
  (see `docs/settlement.md`). It is a suggestion only — "the engine
  currently thinks C should pay A ₹100" — and is normally not written
  to the database at all. Computing/viewing a recommendation **must
  not** automatically create a `Settlement` record.
- **`Settlement`** — a **persisted obligation**, created only through
  an explicit user or system action (e.g. a user accepts a
  recommendation, or explicitly records a settle-up). A `Settlement`
  is auditable, but it is **not** a record of money moving, and it
  does **not** itself change anyone's balance.
- **`Payment`** — the **execution** of a settlement: an actual attempt
  or record of money moving against a specific `Settlement`. Only a
  `Payment` in a **confirmed** state reduces the outstanding balance.
  **V1 supports partial payments**: one `Settlement` may have multiple
  `Payment` records, and the sum of its confirmed payments must never
  exceed the `Settlement` amount.

```
Expense
   ↓
Balance calculation
   ↓
Settlement recommendation (calculated on demand, not persisted)
   ↓  (explicit user/system action — never automatic)
Settlement (persisted obligation)
   ↓
Payment execution (may be more than one, e.g. partial payments)
   ↓
Confirmed Payment(s)
   ↓
Updated balance
```

Balance is therefore:

```
Expenses + Confirmed Payments  →  Balance calculation
```

**not**

```
Expenses + Settlements  →  Balance calculation
```

**and not**

```
Expenses + Settlement recommendations  →  Balance calculation
```

Two automatic-creation rules follow from this model and are both
locked:

- **A settlement recommendation does not automatically create a
  `Settlement`.** Recommendations are ephemeral/calculated; turning
  one into a persisted obligation requires an explicit user or system
  action.
- **Creating a `Settlement` does not automatically create a
  `Payment`.** They are separate writes, typically separate API
  calls: recording an obligation is one action; initiating/confirming
  payment against that obligation is a distinct, later action.

## Planned entities

### User
Represents an authenticated person. Identity is managed by Supabase
Auth; SplitFlow stores a corresponding profile record (display name,
avatar, contact info needed for UPI, etc.).

### Group
A collection of users who share expenses. Has a name, optional
description/avatar, and an owner/creator.

### GroupMember
Join entity between `User` and `Group`, carrying a **role** (e.g.
owner, member) and membership metadata (joined date, status). This is
where group-level authorization checks are rooted.

### Message
A chat message posted within a group by a member. Supports the
group's real-time conversation alongside its financial activity.

### Expense
A shared cost added to a group by a member — a **financial fact**:
money that was actually spent. **V1 supports exactly one payer per
expense** — the single member who fronted the cost. Multi-payer
expenses (more than one person fronting a single expense) are
explicitly **V2 scope**, not V1. Has an amount (integer paise, INR
only in V1), a category, a description, an optional receipt
attachment reference, a status (e.g. active/voided), and a timestamp.
This is a financial source-of-truth record — it is never silently
mutated, and never hard-deleted (see "Voiding & cancellation" below).

### ExpenseParticipant
Join entity between `Expense` and `User` describing how the expense is
split: which members are included, and each member's share (as an
integer paise amount). **V1 supports equal splits and custom splits**
only — no other split strategies (e.g. percentage-based, share-based)
are in scope for V1 unless they reduce to a custom paise-amount split
at entry time. The sum of participant shares must always equal the
expense total — this invariant is enforced by backend logic, not left
to the client.

### ExpenseCategory
A category label for expenses (e.g. Food, Travel, Utilities),
supporting both a system-provided default set and (later) user/AI-
suggested categorization.

### Balance (derived, not stored in V1)
Not a primary source of truth and **not a cached/materialized table in
V1** — this is a locked decision (see `docs/product-decisions.md`).
Represents "who owes whom how much" within a group, computed on read
from `Expense` + `ExpenseParticipant` records together with
**confirmed `Payment`** records only. `Settlement` records are **not**
part of this calculation — they represent obligations/recommendations,
not money movement. A cache table may be introduced later purely for
read performance, but must always be reconstructable from scratch
from the underlying financial records.

### Settlement (persisted obligation)
A **persisted obligation** between two members within a group — e.g.
"C owes A ₹100" — created only through an **explicit user or system
action** (accepting a recommendation, or explicitly recording a
settle-up). A `Settlement` record captures *what is owed*; it does
**not** independently alter financial balances and is **not** itself
a record of money moving. Fields include `from` (obligor), `to`
(obligee), `amount`, a `status`, the owning `Group`, and a timestamp.
Creating a `Settlement` never automatically creates a `Payment` — the
two are separate writes.

**Status lifecycle (semantics; exact enum names finalized at schema
design time):**

- **OPEN** — no confirmed payments yet against this settlement.
- **PARTIALLY_PAID** — at least one confirmed payment exists, but the
  sum of confirmed payments is less than the settlement amount.
- **SETTLED** — the sum of confirmed payments equals the settlement
  amount.
- **CANCELLED** — the obligation was cancelled before being fully
  paid (never hard-deleted — see "Voiding & cancellation").

**Partial payments:** V1 supports partial payments — one `Settlement`
may have multiple `Payment` records. The **sum of confirmed payments
for a `Settlement` must never exceed the `Settlement` amount** (this
invariant is enforced by backend logic, not left to the client). The
**remaining settlement amount** is derived, not stored, as:

```
remaining = settlement.amount − Σ(confirmed payments for that settlement)
```

**Staleness:** a `Settlement` represents the balance state/obligation
*at the time it was created*. If relevant group financial state
changes afterward (e.g. a new expense, an edit, or a void affecting
the same members) before the settlement's payments are confirmed, the
`Settlement` may become **stale** and require recalculation before
being trusted further. The system must never silently let an outdated
settlement override a freshly computed balance — see "Stale
settlements" below for the handling requirement. The exact mechanism
(a `stale`/`requiresRecalculation` flag, a recorded balance snapshot
to compare against, etc.) is left to schema design.

### Payment (execution / status)
Represents the **actual execution** of a settlement: an attempt or
record of money moving against a specific `Settlement`. Carries a
`settlementId` reference, an `amount`, a `method` (e.g. `MANUAL` in
V1; UPI later), and a `status` such as `PENDING`, `CONFIRMED`,
`FAILED`, or `CANCELLED` (exact names finalized at schema design
time). **Only a `Payment` in a `CONFIRMED` state reduces the
outstanding balance** — pending, failed, and cancelled payments do
not. A `Settlement` may have **more than one** `Payment` (partial
payments); see the invariant above.

**Manual payment flow (V1 — the only method available in V1):**

1. The paying member marks the payment as made → a `Payment` is
   created with status **`PENDING`**.
2. The recipient confirms receipt → the `Payment` transitions to
   **`CONFIRMED`**.
3. Only once `CONFIRMED` does the payment affect any balance
   calculation. A `PENDING`, `FAILED`, or `CANCELLED` payment has no
   effect on balances.

**UPI is not available in V1.** The `method` field and status
lifecycle are designed so that, in a future version, an independent
UPI provider confirmation can transition a `Payment` to `CONFIRMED`
without changing this model — but no UPI provider integration exists
in V1, and no UPI method value is active for user-facing flows yet.

### AuditLog (planned, not yet a Prisma model)
Records important actions affecting groups and financial records —
an audit trail, not a financial record itself, and it never replaces
`Expense`, `Settlement`, or `Payment` as the source of truth for what
happened financially. Potential fields: `actorUserId`, `groupId`,
`entityType`, `entityId`, `action`, `metadata`, `createdAt`. Potential
`action` values (examples, not a final enum): `EXPENSE_CREATED`,
`EXPENSE_UPDATED`, `EXPENSE_VOIDED`, `SETTLEMENT_CREATED`,
`PAYMENT_CREATED`, `PAYMENT_CONFIRMED`, `PAYMENT_FAILED`,
`GROUP_MEMBER_ADDED`, `GROUP_MEMBER_REMOVED`. No Prisma model is
being authored for this yet — this is a documentation placeholder for
schema-design time.

**`metadata` must never contain secrets.** This includes, without
limitation: UPI PINs, passwords, authentication tokens/session
tokens, API keys, or any other provider secret. `AuditLog` exists to
record *that* an action happened and relevant non-sensitive context
(e.g. amounts, entity IDs, status transitions) — not to capture
credentials or anything that would need the same protection as a
secret. This applies regardless of payment method, including once
UPI is implemented.

### UpiDetail (future — not used in V1)
Optional UPI identifier information attached to a `User`, used when
generating settlement payment links, **once UPI is implemented in a
future version.** Not created, populated, or surfaced anywhere in the
V1 user experience. Sensitive — access must be scoped to what's
strictly needed (e.g. only exposed to a counterparty actively
settling a balance with that user, not broadcast group-wide), and any
related provider credentials are backend-only (see `AGENTS.md`).

### Notification (future)
Represents an event a user should be alerted to (new expense,
settlement request, chat mention). Deferred past MVP.

### Budget (future)
A user- or group-level spending limit used for personal/group
analytics and alerts. Deferred past MVP.

## Relationship overview (narrative)

- A `User` can belong to many `Group`s, and a `Group` has many
  `User`s, through `GroupMember`.
- A `Group` has many `Message`s and many `Expense`s.
- An `Expense` belongs to one `Group`, has **exactly one** payer
  (`User`) in V1, and has many `ExpenseParticipant` rows describing
  the split across members.
- An `Expense` belongs to one `ExpenseCategory`.
- A settlement **recommendation** is not a stored entity and has no
  relationships of its own — it's a computed view over a `Group`'s
  current balances.
- A `Settlement` belongs to one `Group` and references two `User`s
  (`from`/obligor and `to`/obligee), representing a **persisted**
  obligation. It is created only by an explicit user/system action —
  never automatically from a recommendation, and creating one never
  creates a `Payment`.
- A `Settlement` has **zero or more** `Payment` records recording
  attempts/partial payments to execute it; a `Settlement`'s
  obligation is only reflected in balances via the sum of its
  `CONFIRMED` payments, which must never exceed the `Settlement`
  amount.
- `Balance` state for a group is a function of that group's
  `Expense`/`ExpenseParticipant` records and its **confirmed
  `Payment`** records only — `Settlement` records (and, even more so,
  unpersisted recommendations) are excluded from the calculation.
  Balance is not an independent source of truth and is not stored in
  V1.
- An `AuditLog` entry may reference any `Group` and any financial or
  membership entity (`Expense`, `Settlement`, `Payment`,
  `GroupMember`) via `entityType`/`entityId`, recording that an action
  happened without being the record of the action itself, and never
  carrying secrets in its `metadata`.

## Stale settlements

A `Settlement` freezes the obligation *as calculated at the moment it
was created*. Group financial state can keep changing after that
(new expenses, edits, voids affecting the same members) while the
settlement's payments are still outstanding.

- If relevant financial state changes before a `Settlement`'s
  payments are fully confirmed, the `Settlement` **may become stale**
  and should be flagged as requiring recalculation before being
  trusted further (e.g. before accepting a new payment against it, or
  before displaying it as authoritative).
- The system must **never silently allow an outdated settlement
  recommendation or stale `Settlement` to override a freshly computed
  balance.** Current balances (derived from expenses + confirmed
  payments, per the financial model above) are always the ground
  truth; a stale settlement is a signal to recompute and reconcile,
  not something balances defer to.
- The exact staleness-detection mechanism (e.g. a `stale` /
  `requiresRecalculation` flag, comparing a stored balance snapshot
  against a fresh calculation, versioning) is left to schema design —
  the requirement that staleness is detected and never silently
  ignored is locked now.

## Voiding & cancellation

Financial records (`Expense`, `Settlement`, `Payment`) are never hard
deleted. Cancelling or correcting one is modelled as a status change
(e.g. `voided`) on the original row, optionally paired with a new
correcting record where appropriate. The original record, its values,
and its history remain queryable, which is what makes recomputing
balances and auditing changes possible per `AGENTS.md`.

## Locked V1 decisions affecting this design

The following are locked (see `docs/product-decisions.md` for the
full list and rationale) and should be treated as settled inputs to
schema design, not open questions:

- V1 is **INR-only**; no currency dimension is needed yet.
- V1 supports **exactly one payer per expense**; multi-payer expenses
  are V2.
- V1 supports **equal and custom splits** only.
- Financial records are **never hard-deleted**.
- A **settlement recommendation is calculated on demand and normally
  not persisted**; it does not automatically become a `Settlement`.
- `Settlement` (persisted obligation) and `Payment`
  (execution/status) are **separate entities**; creating a
  `Settlement` does **not** automatically create a `Payment`.
- **V1 supports partial payments**: one `Settlement` may have
  multiple `Payment` records, and the sum of confirmed payments must
  never exceed the `Settlement` amount.
- **Balances are derived from active expenses and confirmed payments
  only** — `Settlement` records (and recommendations) do not
  themselves change balances.
- A `Balance` cache table is **not required in V1** — balances are
  computed on read.
- **Stale settlements must never silently override current
  balances** — see "Stale settlements" above.
- An `AuditLog` entity is planned to record important financial/group
  actions, but is documentation-only for now — no Prisma model yet.
  Its `metadata` must never contain secrets.
- **UPI is not available in V1.** V1 settlement/payment recording is
  manual only; UPI is future scope.

## Open questions for schema design (to resolve before writing `schema.prisma`)

- Exact numeric column type for paise values (e.g. `BigInt` vs `Int`)
  given realistic group expense volumes.
- Exact shape of the status/void marker used for voiding (enum
  values, whether a correcting record is required or optional).
- Idempotency key storage for financial mutation endpoints (see
  `docs/api.md`) — likely a dedicated table or a unique column on the
  mutating tables themselves.
