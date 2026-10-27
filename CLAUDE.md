# Vyapar Sarthii — Claude Code Instructions

## Project Overview
Full-stack ERP + POS SaaS for Indian SMBs. Next.js 15 (App Router) + Prisma + PostgreSQL (Supabase).
Multi-tenant (each Shop is isolated). Multi-locale: en / hi / mr via next-intl.

## Stack
- **Frontend**: Next.js 15, React, Tailwind CSS, SWR
- **Backend**: Next.js API routes (`/api/v1/**`) — no separate server
- **Database**: PostgreSQL on Supabase (`prisma/schema.prisma`)
- **Auth**: Custom JWT (`lib/server/auth.ts`) — NOT Supabase Auth
- **Storage**: Supabase Storage (`invoices` bucket)
- **i18n**: next-intl — keys in `messages/en.json`, `messages/hi.json`, `messages/mr.json`
- **Mobile**: Capacitor (Android/iOS)
- **Desktop**: Electron

## Key Commands
```bash
npm run dev          # Start dev server on :3001
npm run build        # Production build
npm run lint         # ESLint
npm run test:unit    # Node test runner — 103 unit tests (no server needed)
npm run test:e2e     # Playwright E2E — requires dev server on :3000
npm run db:generate  # Prisma client regenerate
npm run db:push      # Push schema to DB (dev only)
npm run db:migrate   # Run migrations (production)
```

## Environment
- `.env.local` — all secrets (DATABASE_URL, SUPABASE keys, API keys)
- DB: Supabase PostgreSQL — `aws-1-ap-southeast-2.pooler.supabase.com`
- Pre-push hook (husky): runs `test:e2e` — skip with `--no-verify` if server not running

## Architecture Rules
- **API routes** live in `app/api/v1/[resource]/route.ts`
- **Server-only logic** lives in `lib/server/` — never import in client components
- **Client hooks** live in `lib/hooks/`
- **Shared utils** live in `lib/` (importable everywhere)
- `eslint-plugin-boundaries` enforces these import boundaries — run `npm run check-boundaries`
- Every API route must call `requireShop(req)` for auth + tenant isolation

## i18n Rules
- Never hardcode UI strings — always use `useTranslations('Namespace')` on client, `getTranslations` on server
- Add keys to ALL THREE files: `messages/en.json`, `messages/hi.json`, `messages/mr.json`
- Namespace per feature (e.g. `QuickAddParty`, `MillBilling`, `Purchases`)

## Database Rules
- Never run destructive migrations without reviewing impact
- Always use `shopId` filter on every query — tenant isolation is critical
- Schema changes: edit `prisma/schema.prisma` → `npm run db:migrate` (or `db:push` in dev)
- Modified schema file must be committed alongside migration

## Security Rules
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `SECRET_KEY` to client (`NEXT_PUBLIC_*`)
- Validate `shopId` ownership on every write operation
- Sanitize file uploads — check MIME type and size before accepting

---

# Project Reliability Rules

## 1. Understand Before Changing
- Read relevant existing code before modifying.
- Inspect related components, API routes, database models, and tests.
- Never assume feature behaviour without checking the implementation.
- Do not rewrite working features unnecessarily.

## 2. Documentation
- Follow PRD.md, Architecture.md, Rules.md, Design.md, Task.md, Memory.md when present.
- Treat actual code and verified runtime behaviour as evidence.
- If docs conflict with code, report the discrepancy.

## 3. Before Implementation
- Identify the root cause.
- List affected files and dependent features.
- Define acceptance criteria and test cases.
- Prefer the smallest safe change.

## 4. Testing Requirements
- Run `npm run test:unit` before and after every change.
- Run `npm run lint` and `npx tsc --noEmit` for type safety.
- Run `npm run test:e2e` when the dev server is available.
- Never report a test as passed unless it was actually executed.
- Add a regression test for every reproducible bug.

## 5. Real-World Verification
- Verify affected features through the running app when possible.
- Check UI, API responses, and database state.
- Use browser preview to confirm visual changes.
- Distinguish automated verification from manual verification.

## 6. Database and Security
- Never reset or modify production data without explicit authorization.
- Do not expose secrets in reports or logs.
- Validate authorization and tenant isolation on every change.

## 7. Change Safety
- Run `git status` before editing.
- Keep changes focused — review the final diff.
- Do not silently disable tests or suppress errors.

## 8. Completion Gate
A task is complete only when:
1. Acceptance criteria checked
2. `npm run test:unit` passed
3. `npx tsc --noEmit` clean
4. Final diff reviewed
5. Remaining risks documented

## 9. Final Report Format
- Root cause
- Files changed
- Tests executed and results
- UI/API/DB verification evidence
- Regression test added (yes/no)
- Remaining limitations
