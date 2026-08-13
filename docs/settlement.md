# SplitFlow — Settlement

## The problem

Within a group, every expense creates a web of small debts: Alex paid
for dinner and is owed by Bala and Chitra; Bala paid for the cab and
is owed by Alex and Chitra; and so on. Left unresolved, a group with N
expenses can end up with a large number of pairwise debts, most of
which are redundant — if Alex owes Bala ₹200 and Bala owes Chitra
₹200, the group doesn't need two payments, it needs one: Alex pays
Chitra ₹200.

SplitFlow's settlement engine exists to solve exactly this: given the
net balance of every member in a group (derived from all active
expenses and all **confirmed payments** — not from `Settlement`
records themselves, see `docs/database.md`), produce a **reduced set
of payments** that brings every member's balance to zero — materially
fewer payments than settling every pairwise debt individually.

**A note on "optimal":** minimizing the number of transactions
required to settle a set of balances exactly (the general debt-
simplification problem) is NP-hard in the general case. SplitFlow
does **not** claim its recommendations are the mathematical global
minimum unless and until the implemented algorithm specifically
guarantees that property (e.g. is proven optimal for the constraint
set in use, or the group is small enough to brute-force). Until an
algorithm with that guarantee is chosen and documented, all product
and API surfaces should describe the output as "optimized" /
"reduced" / "a small number of payments," never as "the minimum" or
"the fewest possible."

## Requirements

- **Correctness first.** The recommended payments must exactly settle
  every member's balance — no rounding drift, no leftover paise
  anywhere in the group.
- **Reduce transaction count.** Given the net balances, the engine
  should find a small number of payments to settle the group — not
  necessarily the mathematically optimal minimum in every case (see
  note above), but a materially better result than "settle every
  pairwise debt individually." (This is a variant of a min-cash-flow /
  debt simplification problem.)
- **Determinism, including tie-breaking.** The same set of balances
  must always produce the same recommended settlement plan. This
  requires not just a deterministic algorithm but a **defined
  tie-breaking rule** for cases where more than one valid payment plan
  ties on transaction count (e.g. when multiple members have equal
  net balances) — for instance, breaking ties by a stable ordering
  such as user ID, join date, or name, applied consistently. The exact
  tie-breaking rule will be pinned down alongside the algorithm choice
  when settlement logic is implemented, but the requirement that one
  exists and is documented is locked now. No randomness, and
  critically, **no AI involvement** — this is pure backend business
  logic operating on integer paise values.
- **Auditable inputs.** The balances the engine consumes must
  themselves be reconstructable from active `Expense` records and
  **confirmed `Payment`** records at any time (see `docs/database.md`)
  — not from `Settlement` records, which are obligations/
  recommendations, not money movement — so a settlement recommendation
  can always be explained and re-derived, not just trusted.
- **Obligation vs. execution are separate, and creating one never
  creates the other.** A settlement *recommendation* is a suggestion
  computed on demand and is **normally not persisted at all** —
  viewing/computing a recommendation must **not** automatically create
  a `Settlement` record. Only an explicit user or system action
  (accepting/recording a settle-up) creates a `Settlement`
  representing the **obligation** ("C owes A ₹100," status `OPEN`) —
  this alone does **not** change any balance. Creating a `Settlement`
  must **not** automatically create a `Payment`. Whether and how that
  obligation was actually paid is tracked on separate `Payment`
  record(s) — V1 supports **partial payments**, so a `Settlement` may
  have more than one `Payment` — created by a distinct, later action
  (status: `PENDING` → `CONFIRMED`/`FAILED`/`CANCELLED`; method:
  `MANUAL` in V1, UPI in a future version — **not available in V1**).
  A balance only reflects the sum of a settlement's `CONFIRMED`
  payments, which must never exceed the settlement amount. See
  `docs/database.md` for the entity split.
- **Recommendations must reflect current balances, not stale ones.**
  Because a `Settlement` freezes the obligation at creation time, and
  group financial state can change afterward, a settlement (or an
  un-refreshed recommendation) can become stale relative to current
  balances. The engine and any surface presenting a recommendation
  must never let a stale recommendation or settlement silently
  override a freshly computed balance — see "Stale settlements" in
  `docs/database.md`.

## Out of scope for this phase

The actual algorithm (e.g. greedy max-debtor/max-creditor pairing,
or a more exact minimum-transaction-count approach) is not being
implemented yet. This document exists to fix the requirements the
future implementation must satisfy, and to make explicit that
**settlement math is backend-only, deterministic, integer-paise
logic** — never delegated to the frontend or to AI.
