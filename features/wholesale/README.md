# Udyog (Wholesale) Package — Feature Ownership

**Package ID:** `wholesale`  
**Team:** Wholesale team  
**Ping:** @wholesale-team

## Scope

Distribution / wholesale business features — challans, orders, warehouses, party management, transfers.

Modules in this package: `dashboard, orders, challans, billing, products, party, suppliers, warehouses, purchases, stock, stock-take, transfers, expenses, staff, reports, import, settings, profile, calendar, returns, referral, dukandar`

## What lives here

- `features/wholesale/` — Udyog-specific UI components
- Challans, orders, warehouses, transfers pages/components
- `isWholesaleTierPackage()` returns true for this package

## Owns

- `/app/api/v1/challans/`
- `/app/api/v1/orders/`
- `/app/api/v1/warehouses/`
- `/app/api/v1/transfers/`
- `/components/wholesale/`

## Rules

- Do NOT import from `features/mill/`
- Mill-specific billing (GST-exclusive rates, non-GST charges) is in `features/mill/` — do not add it here
- `isMillBillingPackage()` should always return false for this package

## Cross-package changes

`/app/[locale]/(main)/challans/` is shared with mill team — needs @wholesale-team + @mill-team review.
