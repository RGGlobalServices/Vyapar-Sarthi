# Testing — Vyapar Sarthii ERP & POS

---

## Commands

```bash
npm run test:unit      # Node test runner — pure unit tests, no server needed (~146 tests)
npm run test:e2e       # Playwright E2E — requires dev server running on :3000
npm run lint           # ESLint
npx tsc --noEmit       # TypeScript check (no output files)
npm run check-boundaries  # ESLint import-boundary check (lib/server/* never in client)
```

---

## Completion Gate

A change is NOT done until all of these pass:

1. `npm run test:unit` — all pass
2. `npx tsc --noEmit` — zero errors
3. `npm run lint` — zero errors
4. Manual browser verification of the changed feature
5. Final `git diff` reviewed for unintended changes

---

## Unit Tests (`tests/unit/`)

Written using Node's built-in test runner (`node:test`). No server, no DB — pure functions only.

### Current test files

| File | What it covers |
|------|---------------|
| `variantTitleParser.test.mjs` | Variant key parsing, `variantKeyOf`, `normKey`, `keysMatch` |
| `exchangeAccounting.test.mjs` | Exchange net amount calculations, return + new-bill total |
| `sizeRange.test.mjs` | Mill product size range parsing (`lib/sizeRange.ts`) |

### Adding a unit test

1. Create `tests/unit/<featureName>.test.mjs`.
2. Import the function under test from `lib/` (shared utils only — never `lib/server/*`).
3. Use `test()` and `assert` from `node:test` and `node:assert`.
4. Run `npm run test:unit` to confirm it passes.

**Add a regression test for every reproducible bug** — the test should fail before the fix and pass after.

---

## E2E Tests (`tests/e2e/`)

Playwright tests. Require dev server on `:3000` (`npm run dev` and set PORT=3000).

Pre-push git hook runs E2E automatically. Skip with `--no-verify` only if server is not running.

### Critical user journeys to cover

- Login → Dashboard loads
- Add product → appears in stock list
- Create sale → customer balance updated, stock decremented
- Stock Take: start → count items → commit → verify stock updated
- Purchase → stock incremented
- Return → stock restored, customer balance reversed

---

## What NOT to Test

- Don't test Prisma queries with mocks — they give false confidence. Use the real DB or skip.
- Don't test Next.js routing or framework internals.
- Don't test UI styling — only functional behaviour.

---

## Manual Verification Checklist

After any change to billing, stock, or financials:

- [ ] Create a sale and verify stock decremented correctly (check variant and flat)
- [ ] Cancel the sale and verify stock restored
- [ ] Start a stock take and verify per-variant rows appear
- [ ] Commit stock take and verify both `size_variants` and `variants[]` updated
- [ ] Create a purchase and verify stock incremented
- [ ] Verify customer balance updated correctly

---

## Package-Specific Testing

Test features in the correct package tier:

| Feature | Package to test in |
|---------|-------------------|
| Import page | vyapar or above |
| Party, Warehouses, Transfers | wholesale (Udyog) or above |
| Deliveries/Slips tabs in Suppliers | badaudyog (Bada Udyog) only |
| Mill billing | badaudyog only |
| Gate Entry, Production, Quality Lab | badaudyog only |

Log in as a shop with the correct `packageType` to test gated features.

---

## Release Gate

Before any production release:
1. `npm run build` — must complete without errors
2. `npm run test:unit` — all pass
3. `npx tsc --noEmit` — zero errors
4. `npm run lint` — zero errors
5. Critical journeys verified manually in the staging/dev server
6. `npm run db:migrate` run and confirmed (if schema changed)
