# Architecture — Vyapar Sarthii ERP & POS

## Overview

Full-stack SaaS — Next.js 15 App Router (no separate backend server). Every tenant is an isolated **Shop**. Four package tiers gate features at runtime.

---

## Package Tiers

| ID | Label | Key Extra Modules |
|----|-------|-------------------|
| `dukan` | Dukan Package | Billing, Products, Udhar, Expenses, Staff |
| `vyapar` | Vyapar Package | Dukan + **Import** |
| `wholesale` | Udyog Package | Vyapar + **Party, Orders, Warehouses, Transfers** |
| `badaudyog` | Bada Udyog Package | Udyog + **Mill Ops** (Gate Entry, Weighbridge, Production, Quality Lab, Batches, Raw Material, Finished Goods, By-Products, Job Work, Logistics, Finance, Machines) |

**Key helpers** (`lib/config/packageConfig.ts`):
- `isWholesaleTierPackage(type)` → true for `wholesale` and `badaudyog`
- `isMillBillingPackage(type)` → true for `badaudyog` only

Never use `packageType === 'badaudyog'` inline — always call these helpers.

---

## Directory Layout

```
app/
  [locale]/
    (main)/          # Authenticated app pages (sidebar layout)
      billing/
      products/
      stock/
      purchases/
      ...            # One folder per module
    (auth)/          # Login, register, forgot-password
  api/v1/            # All API routes — no separate server
    auth/
    billing/
    products/
    stock/
    stock-take/
    mill/            # Mill-only (gate-entry, weighbridge, production, etc.)
    logistics/       # Transport, dispatch (badaudyog)
    management/      # Brokers, machines, maintenance, spare-parts (badaudyog)
    ...

lib/
  server/            # Server-only — NEVER import in client components
    auth.ts          # JWT verification + requireShop/requireUser helpers
    prisma.ts        # Single PrismaClient instance
    purchases.ts     # Complex purchase mutation logic
    ...
  hooks/             # SWR hooks for client components
  config/
    packageConfig.ts # Package tier definitions and helper functions
  variants.ts        # Variant store utilities (shared client + server)
  financialEngine.ts # GST/discount/total calculation (shared)
  sizeRange.ts       # Size parsing for mill products
  api.ts             # Axios instance (client-side)
  utils.ts           # cn(), formatters, etc.

prisma/
  schema.prisma      # Single source of truth for the DB schema

messages/
  en.json
  hi.json
  mr.json            # All three must be updated together
```

---

## Request Lifecycle

```
Browser  →  Next.js API Route (app/api/v1/…/route.ts)
               │
               ├─ requireShop(req)         ← auth.ts: verifies JWT, loads shop + packageType
               │    └─ in-memory TTL cache collapses parallel calls per page load
               │
               ├─ Business logic           ← lib/server/* or inline
               │
               └─ prisma.*                 ← always filtered by shopId
```

Every route MUST call `requireShop(req)` first. Skipping it is a critical multi-tenant security bug.

---

## Authentication

- Custom JWT — **NOT** Supabase Auth.
- Token signed with `SECRET_KEY` env var (HS256).
- Sent as `Authorization: Bearer <token>` header.
- `requireShop(req)` returns `{ shop, user }` — shop includes `packageType`.
- Sessions tracked in `user_sessions` table (device, IP, last seen).
- Admin routes use a separate `requireAdmin(req)` path.

---

## Database

- PostgreSQL on Supabase (Sydney region, `aws-1-ap-southeast-2.pooler.supabase.com`).
- Prisma ORM — schema at `prisma/schema.prisma`.
- Transaction-mode pooler (port 6543) for runtime queries; direct (5432) for migrations.
- Every table has a `shopId` FK — tenant isolation enforced at query level, not DB-level RLS.

---

## Storage

- Supabase Storage, bucket `invoices` — PDF invoices, upload attachments.
- File type and size validated server-side before upload accepted.
- `SUPABASE_SERVICE_ROLE_KEY` only used server-side — never exposed as `NEXT_PUBLIC_*`.

---

## Frontend Patterns

- **SWR** for all data fetching (`lib/hooks/`).
- **Zustand** for global client state (`lib/businessStore.ts` — active shop, profile).
- **next-intl** for i18n — never hardcode UI strings.
- **Tailwind CSS** — dark mode via `dark:` prefix.
- Sheet/modal pattern for forms; full page for complex views.
- `isMillBillingPackage` / `isWholesaleTierPackage` checked in UI to show/hide tabs and buttons.

---

## Mobile & Desktop

- **Capacitor** wraps the Next.js web app for Android/iOS.
- **Electron** wraps it for desktop (Windows/Mac).
- Offline sync via `sync_records` table + background queue.

---

## Import Boundaries (enforced by ESLint)

```
lib/server/*   →  server only (Prisma, secrets, Node APIs)
lib/hooks/*    →  client only (SWR, React state)
lib/*          →  shared (no Prisma, no React hooks)
app/api/**     →  may import lib/server/* and lib/*
app/[locale]/* →  may import lib/hooks/* and lib/* — NEVER lib/server/*
```

Run `npm run check-boundaries` to verify.
