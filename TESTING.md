# Testing Guide — Vyapar Sarthii

## Prerequisites
- Node.js 20+
- `.env.local` configured (Supabase DB + keys)
- Dev server running at `http://localhost:3001` for E2E tests

## Starting the App
```bash
npm run dev      # starts on :3001 (localhost:3001/en/login)
```

## Available Test Suites

### 1. Unit Tests (no server needed)
```bash
npm run test:unit
```
- **Runner**: Node built-in test runner (`node --test`)
- **Files**: `tests/unit/*.test.mjs`
- **Coverage**: 103 tests, all passing
- **Tests**:
  - `lots.test.mjs` — lot splitting, merging logic
  - `millBill.test.mjs` — mill bill calculations
  - `millBilling.test.mjs` — mill billing flows
  - `millSuggest.test.mjs` — mill party/product suggestion
  - `quickEntry.test.mjs` — quick entry parsing
  - `variantTitleParser.test.mjs` — variant title parsing
  - `variants.test.mjs` — variant logic (102 subtests)

### 2. TypeScript Type Check (no server needed)
```bash
npx tsc --noEmit
```
- Must return 0 errors before any commit.

### 3. Lint (no server needed)
```bash
npm run lint
npm run check-boundaries    # import boundary violations
```

### 4. E2E Tests (requires dev server on :3000 or :3001)
```bash
# Set base URL to match your dev port:
E2E_BASE_URL=http://localhost:3001 npx playwright test

# Or via npm script (expects :3000):
npm run test:e2e
```
- **Runner**: Playwright (`playwright.config.ts`)
- **Files**: `tests/e2e/*.spec.ts`
- **Tests**:
  - `auth.spec.ts` — login, logout, session
  - `billing.spec.ts` — create sale / bill flow
  - `navigation.spec.ts` — sidebar navigation
  - `variants.spec.ts` — product variants UI

> **Note**: Pre-push husky hook runs `test:e2e`. If dev server is not running, push with `git push --no-verify`.

## Critical User Journeys (manual verification checklist)

| Journey | Automated? | Notes |
|---|---|---|
| Login / logout | ✅ auth.spec.ts | |
| Create a Sale / Bill | ✅ billing.spec.ts | |
| Add Party from billing | ❌ missing | QuickAddPartyModal |
| Purchase entry (mill) | ❌ missing | Goni/bag deduction |
| Stock take | ❌ missing | |
| Import via camera/OCR | ❌ missing | Requires device |
| Supabase Storage upload | ❌ missing | File upload API |
| Realtime sync | ❌ missing | Supabase realtime |
| WhatsApp bill share | ❌ missing | Twilio integration |
| Subscription / payment | ❌ missing | PayU integration |

## Test Environment Configuration

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase pooler (see `.env.local`) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wwblxjdfuxaqkbloaicw.supabase.co` |
| `E2E_BASE_URL` | `http://localhost:3001` |

## Known Failures / Limitations
- `test:e2e` fails without a running dev server (pre-push hook issue).
- E2E tests use `localhost:3000` by default — set `E2E_BASE_URL=http://localhost:3001`.
- No API-level integration tests exist yet.
- OCR/camera tests require a real device (Capacitor).
- Realtime sync tests require Supabase realtime enabled on tables.

## Recommended Missing Tests (priority order)
1. **API integration tests** — `POST /api/v1/billing`, `POST /api/v1/purchases`
2. **QuickAddPartyModal E2E** — farmer vs customer flow
3. **Mill purchase E2E** — goni weight deduction
4. **Stock take E2E** — full scan → close flow
5. **File upload test** — Supabase Storage bucket policy
