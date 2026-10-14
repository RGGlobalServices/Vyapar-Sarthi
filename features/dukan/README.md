# Dukan Package — Feature Ownership

**Package ID:** `dukan`  
**Team:** Dukan team  
**Ping:** @dukan-team

## Scope

Small retail shop features — billing, udhar (credit), dukandar portal, returns.

Modules in this package: `dashboard, billing, products, customers, suppliers, purchases, stock, stock-take, expenses, udhar, staff, reports, settings, profile, calendar, returns, referral, dukandar`

## What lives here

- Dukan-specific UI components (billing overrides, udhar flow)
- Any feature that is **only** for Dukan package (not Vyapar/Udyog/Bada Udyog)

## Rules

- Do NOT import from `features/wholesale/` or `features/mill/`
- Shared components go in `components/core/`, not here
- `isWholesaleTierPackage()` and `isMillBillingPackage()` should always return false for this package — never add mill/wholesale logic here

## Cross-package changes

Any change to `/components/core/` or `/app/[locale]/(main)/billing/` needs @core-team review.
