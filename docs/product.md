# SplitFlow — Product

## Vision

SplitFlow is a real-time group expense management and settlement
platform. It replaces the friction of manually tracking who paid for
what within a group — trips, roommates, recurring outings, shared
projects — with a single shared space where expenses, conversation,
and balances live together and stay in sync automatically.

The product's core promise: **you should never have to do the math
yourself.** Add an expense, and SplitFlow keeps every member's balance
correct in real time, then tells the group a reduced, optimized set of
payments needed to settle up (see `docs/settlement.md` for why this is
deliberately not phrased as "the mathematical minimum").

## Target users

- **Friend groups and roommates** splitting recurring shared costs
  (rent, groceries, utilities, nights out).
- **Trip groups** managing many one-off expenses across a short,
  intense period (flights, hotels, meals, activities), settling up
  once at the end. (V1 is INR-only — see `docs/product-decisions.md`;
  trips with genuinely foreign-currency spend are future scope.)
- **Ad-hoc groups** (a work outing, a shared gift, a one-time event)
  that need lightweight expense splitting without setting up a
  permanent structure.

## Core user experience

1. A user creates or joins a **group**.
2. Members **chat** within the group — expenses and conversation
   share the same space, so context isn't lost across apps.
3. Any member **adds a shared expense** (as its single payer in V1)
   and chooses who it should be split between.
4. The expense is **split** — equally by default, or with a custom
   split when needed.
5. SplitFlow **automatically recalculates balances** for every
   affected member the moment the expense is saved.
6. At any time, a member can view **settlement recommendations** — a
   reduced, optimized set of payments that would bring everyone's
   balance to zero (see `docs/settlement.md` for why this isn't
   described as "the minimum" unless the algorithm guarantees it).
7. A member can **record a payment** against a recommended settlement
   — in V1 this is always **manual** (mark as paid, then the
   recipient confirms receipt) — and the group's balances update once
   that payment is confirmed. UPI-based payment is **not available in
   V1**; it's future scope (see `docs/product-decisions.md`).

## MVP scope

The MVP (V1) is intentionally narrow and financial-integrity-first.
The locked V1 product decisions are recorded in full in
[`docs/product-decisions.md`](product-decisions.md); in summary:

- Email/phone authentication and basic user profiles
- Groups, group membership, and basic roles (e.g. owner/member)
- Group chat
- Shared expenses, **single payer per expense**, with equal and
  custom splitting (INR only)
- Expense categories
- Deterministic balance calculation (derived on read, no cache)
- Settlement recommendations, deterministic with a defined
  tie-breaking rule, described as "reduced"/"optimized" rather than
  a guaranteed mathematical minimum. A recommendation is calculated
  on demand and is not itself persisted or acted upon until a user
  explicitly records/accepts it as a `Settlement`.
- Settlement tracking, with settlement **obligations** (`Settlement`)
  and **payment execution/status** (`Payment`, supporting partial
  payments) tracked as separate records. **V1 payment recording is
  manual only** — a user marks a payment as made, the recipient
  confirms receipt, and only then does it affect balances. UPI is
  **not available in V1**.

Multi-payer expenses, **all UPI functionality** (V1 has no UPI
integration of any kind — settlement/payment recording is manual
only), multi-currency support, receipt-upload AI extraction, and
analytics are explicitly **out of V1 scope** (most are V2+) but are
designed for from day one so they can be layered on without
architectural rework.

## Future features

- Receipt uploads with AI-assisted extraction (amount, merchant,
  category) — always validated by backend logic before being trusted
- AI-assisted expense categorization
- UPI-based settlement initiation and confirmation
- Group summaries and spend analytics
- Personal spending analytics across groups
- Budgets and budget alerts
- Notifications (new expense, settlement request, chat activity)
- Richer roles/permissions within a group

## Non-goals (for now)

- SplitFlow is not a general-purpose accounting or invoicing tool.
- SplitFlow does not hold user funds; it tracks obligations and, in
  future versions, will facilitate settlement through external
  payment rails (UPI). **UPI is not available in V1** — see
  `docs/product-decisions.md`.
