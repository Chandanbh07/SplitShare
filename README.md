# SplitFlow

SplitFlow is a real-time group expense management and settlement platform.
Users create groups, chat with members, add shared expenses, split them
across participants, and get optimized settlement recommendations. In V1,
settlements are recorded manually; UPI-based settlement is future scope,
not available in V1 (see `docs/product-decisions.md`).

## Status

This repository is currently in the **initialization phase**. Only the
project structure and architecture documentation exist. No application
code (auth, APIs, UI, database migrations, chat, expenses, settlement,
UPI, or AI features) has been implemented yet.

See `docs/` for the current plans:

- [`docs/product.md`](docs/product.md) — product vision & MVP scope
- [`docs/product-decisions.md`](docs/product-decisions.md) — locked V1 product decisions
- [`docs/architecture.md`](docs/architecture.md) — system architecture
- [`docs/database.md`](docs/database.md) — planned data model (no schema yet)
- [`docs/settlement.md`](docs/settlement.md) — settlement problem & approach
- [`docs/api.md`](docs/api.md) — planned API domains
- [`docs/decisions.md`](docs/decisions.md) — technology/architecture decisions

Engineering rules that apply to everyone (including AI agents) working in
this repo are in [`AGENTS.md`](AGENTS.md). Read it before making changes.

## Planned technology stack

**Frontend:** React, TypeScript, Vite, Tailwind CSS, React Query, Zustand, Socket.IO client

**Backend:** Node.js, TypeScript, Express, Prisma, PostgreSQL, Socket.IO

**Validation:** Zod (planned, for `packages/validation`)

**Auth:** Supabase Auth (planned)

**Storage:** Supabase Storage or S3-compatible object storage (planned)

**AI:** Gemini API (planned, suggestions/extraction only — never financial calculation)

**Payments:** UPI (future scope — **not available in V1**; V1 settlement/payment recording is manual only)

## Repository layout

```
splitflow/
├── apps/
│   ├── web/          # React frontend (not yet implemented)
│   └── api/           # Express backend (not yet implemented)
├── packages/
│   ├── types/          # Shared TypeScript types (not yet implemented)
│   └── validation/      # Shared validation schemas (planned: Zod, not yet implemented)
├── prisma/
│   └── schema.prisma    # Placeholder — real schema comes after design review
├── docs/                 # Architecture & product documentation
├── AGENTS.md              # Permanent engineering rules
├── README.md
├── .gitignore
└── .env.example
```

## Getting started

Not yet applicable — no runnable code exists in this repository yet.
This section will be filled in once `apps/api` and `apps/web` are
scaffolded with actual dependencies.
