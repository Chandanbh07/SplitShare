# SplitFlow — API

This document describes the **planned** API domains for the backend
(`apps/api`). No endpoints have been implemented yet — this is a scope
map for future work, so that authorization, validation, and
consistency concerns can be considered up front.

## Transport

- **REST (HTTPS, JSON)** for standard CRUD-style and command
  operations.
- **Socket.IO** for real-time chat delivery and financial-state
  change notifications (see `docs/architecture.md`).

All endpoints and socket events will require an authenticated,
authorized caller — there is no anonymous or client-trusted path to
financial or group data.

## Planned domains

### Auth
Session/token validation against Supabase Auth; profile bootstrap
after first sign-in. SplitFlow does not reimplement authentication —
it validates Supabase-issued credentials.

### Users / Profiles
Read and update the current user's profile. Read limited, non-
sensitive profile info of other users within shared groups only
(name/avatar) — never broad user search/enumeration.

### Groups
Create a group, update group metadata, list a user's groups, view a
single group's details (scoped to members).

### Group Members
Invite/add a member, remove a member, change a member's role, list a
group's members. All mutating operations require an authorized role
(e.g. owner) within that specific group.

### Chat / Messages
Send a message (via socket, persisted via backend), fetch message
history for a group (REST, paginated).

### Expenses
Create an expense (single payer, amount in paise/INR, category,
participants, equal or custom split — see `docs/product-decisions.md`
for V1 scope), edit/void an expense (auditable, never a hard delete —
voiding preserves the original record and marks it, per
`docs/database.md`), list a group's expenses, view a single expense's
detail including its participant split.

### Categories
List available expense categories (system defaults initially; user/AI
suggested categories layered in later, always going through the same
validated write path as manual entries).

### Balances
Compute and return the current balance state for a group (who owes
whom), always derived on read from active expense records and
**confirmed payment** records only — `Settlement` records are not
part of this calculation (see `docs/database.md`). Never trusted from
a client-supplied value, and not served from a stored cache in V1.

### Settlement recommendations
Fetch settlement **recommendations** for a group — computed on
demand, deterministic, with a defined tie-breaking rule (see
`docs/settlement.md`; described as "reduced"/"optimized," never
claimed as the mathematical global minimum unless the implemented
algorithm guarantees it). Fetching a recommendation is a **read-only
computation and does not persist anything** — it must **not**
automatically create a `Settlement` record.

### Settlements
Creating a settlement (e.g. `POST /groups/:groupId/settlements`) —
typically by accepting a recommendation, or explicitly recording a
settle-up — creates **only** a `Settlement` record: the persisted
obligation ("C owes A ₹100," `status: OPEN`). It does **not** create a
`Payment`, and it does **not** change any balance on its own. A
`Settlement` may become **stale** if group financial state changes
before it's paid — see "Stale settlements" in `docs/database.md`; a
stale settlement is never allowed to silently override a freshly
computed balance.

### Payments
Initiating or recording a payment against an existing settlement
(e.g. `POST /settlements/:settlementId/payments`) creates or updates
a **`Payment`** record — the execution/status of resolving that
`Settlement` (`method`: `MANUAL` in V1 — **UPI is not available in
V1**, it's future scope; `status`: `PENDING` → `CONFIRMED` / `FAILED`
/ `CANCELLED`, exact names finalized at schema design time). **V1
supports partial payments**: a `Settlement` may have more than one
`Payment`, and the sum of its confirmed payments must never exceed the
settlement amount. The V1 manual flow is: the payer marks a payment as
made (`Payment` created as `PENDING`), then the recipient confirms
receipt (`Payment` becomes `CONFIRMED`). Only once a `Payment` reaches
**`CONFIRMED`** does the group's balance calculation reflect it. A
future UPI provider integration could independently transition a
`Payment` to `CONFIRMED` without changing this model. Exact endpoint
naming may be refined later, but `Settlement` creation and `Payment`
creation/confirmation **remain separate API operations, never a
single combined write** — see `docs/database.md`.

### Receipts (future)
Upload a receipt image to storage; trigger AI extraction; receive a
suggested amount/merchant/category that must still pass normal
validation before being attached to an expense.

### Analytics (future)
Group-level spending summaries; personal spending analytics across a
user's groups.

### Budgets (future)
Create/update a personal or group budget; compare against actual
spend.

### Notifications (future)
List/mark-read notifications for events like new expenses or
settlement requests.

## Cross-cutting concerns (apply to every domain above)

- **Authorization**: every route/event checks group membership and
  role where relevant — enforced server-side, never inferred from
  client state.
- **Validation**: request payloads are validated against shared
  schemas in `packages/validation` before touching business logic.
- **Money**: all amounts in request/response bodies are integer paise
  (**INR only in V1** — no currency field on the wire yet); no floats
  cross the API boundary.
- **Auditability**: mutating endpoints for financial data record
  enough information (actor, timestamp) to support the auditability
  requirement in `AGENTS.md`, and never hard-delete — cancellation is
  always a status change on the original record. Significant actions
  (expense created/updated/voided, settlement created, payment
  created/confirmed/failed, membership changes) are additionally
  written to `AuditLog` (see `docs/database.md`) — an audit trail, not
  a substitute for the underlying financial records. `AuditLog`
  `metadata` must never contain secrets (UPI PINs, passwords, auth
  tokens, provider credentials, etc.).
- **Idempotency**: financial mutation endpoints (create/edit an
  expense, record a settlement, record a payment) accept a
  client-supplied idempotency key so that retried requests — e.g. a
  client retrying after a timeout — do not create duplicate financial
  records. The server treats a repeated key as "return the original
  result," not "create again." Exact mechanism (header name, storage,
  TTL) will be defined when these endpoints are implemented; the
  requirement itself is locked now (see `docs/product-decisions.md`).
