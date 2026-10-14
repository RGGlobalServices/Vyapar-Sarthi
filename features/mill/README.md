# Bada Udyog (Mill) Package — Feature Ownership

**Package ID:** `badaudyog`  
**Team:** Mill team  
**Ping:** @mill-team

## Scope

Grain-processing / manufacturing mill features. Everything wholesale has + full mill operations pipeline.

Mill-specific modules: `gate-entry, weighbridge, production, quality-lab, batches, raw-material, finished-goods, by-products, wip, rejections, job-work, transport, dispatch, hamali, freight, payments, receipts, outstanding, ledger, cashbook, bank, settlement, brokers, machines, maintenance, spare-parts, documents`

## What lives here

- `features/mill/` — all mill-specific UI components (Phase 2+)
- `components/mill/` — already exists: BatchesModule, PackingPending etc.
- Mill billing: GST-exclusive rates, non-GST charges, round-off (`mill_v2`)
- Gate entry → weighbridge → batches → production → finished goods pipeline

## Owns

- `/app/api/v1/mill/`
- `/app/api/v1/logistics/`
- `/app/api/v1/management/`
- `/components/mill/`
- `/app/[locale]/(main)/gate-entry/`
- `/app/[locale]/(main)/weighbridge/`
- `/app/[locale]/(main)/job-work/`
- `/app/[locale]/(main)/ledger/`
- `/app/[locale]/(main)/outstanding/`

## Rules

- Mill billing logic (`isMillBillingPackage()`) must NEVER bleed into Dukan/Vyapar/Udyog pages
- `WholesaleBillingUI.tsx` mill sections → Phase 2 मध्ये `features/mill/billing/MillBillingUI.tsx` मध्ये extract करायचं
- Job-work never touches `Product.currentStock` or `RawMaterialLot` (mill doesn't own that grain)

## Phase 2 target (next sprint)

Extract from `WholesaleBillingUI.tsx`:
```
if (isMill) → <MillBillingUI />    ← features/mill/billing/MillBillingUI.tsx
else        → <StandardBillingUI /> ← components/core/billing/StandardBillingUI.tsx
```

## Cross-package changes

`/app/[locale]/(main)/challans/` is shared with wholesale team — needs @mill-team + @wholesale-team review.  
Any change to `lib/config/packageConfig.ts` needs @core-team review.
