# Vyapar Package — Feature Ownership

**Package ID:** `vyapar`  
**Team:** Vyapar team  
**Ping:** @vyapar-team

## Scope

Mid-size business features — everything Dukan has + import, enhanced reports, party ledger.

Modules in this package: `dashboard, billing, products, customers, suppliers, purchases, stock, stock-take, expenses, udhar, staff, reports, import, settings, profile, calendar, returns, referral, dukandar`

## What lives here

- Vyapar-specific UI (import flow, extended reports)
- Any feature that is **only** for Vyapar (not Dukan/Udyog/Bada Udyog)

## Rules

- Do NOT import from `features/wholesale/` or `features/mill/`
- Shared components go in `components/core/`, not here
- `isWholesaleTierPackage()` should always return false for this package

## Cross-package changes

Any change to `/components/core/` or `/app/[locale]/(main)/billing/` needs @core-team review.
