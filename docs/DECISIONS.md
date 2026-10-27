# Technical Decisions — Vyapar Sarthii ERP & POS

Decisions that are load-bearing. Change them only after understanding the why.

---

## 1. Custom JWT Auth (not Supabase Auth)

**Decision**: Roll our own JWT with `jsonwebtoken`, not Supabase Auth.  
**Why**: Supabase Auth was too opinionated for our multi-shop model (one user → many shops with different roles). Custom JWT lets us embed `sub` (user UUID) and `sessionId`, and we do all the shop-ownership lookup ourselves.  
**Don't change**: Switching to Supabase Auth would require rewriting every `requireShop()` call and migrating all sessions.

---

## 2. Transaction-Mode DB Pooler (port 6543)

**Decision**: `DATABASE_URL` points to the Supabase transaction-mode pooler (port 6543), not the direct connection (5432).  
**Why**: Direct connections are limited (the Supabase instance ran out of connection slots under parallel API requests). Transaction mode releases the backend connection after each statement.  
**Constraint**: Migrations require a real session — `DIRECT_URL` (port 5432) is used for `prisma migrate` only.

---

## 3. Three Mirrored Variant Stores

**Decision**: Variant stock is stored three ways simultaneously — `size_variants` (JSON map), `variants[]` (JSON array), `currentStock` (flat sum).  
**Why**: Legacy billing (Dukan/Vyapar) reads `size_variants`; the modern ERP UI reads `variants[]`; reports read `currentStock`. Removing any one breaks something that we cannot quickly audit.  
**Rule**: Always use `openVariantStores`/`adjustVariantStores`/`closeVariantStores` from `lib/variants.ts`. Direct JSON writes caused the "variants disappear after stock take" bug.  
**Don't change**: Don't try to collapse to a single store without auditing every reader.

---

## 4. Package Tiers as DB Strings (not separate tables/plans)

**Decision**: `Shop.packageType` is a plain `VARCHAR` column ('dukan' | 'vyapar' | 'wholesale' | 'badaudyog').  
**Why**: Simple to query, simple to gate. A separate `plans` table would add a join to every authenticated request.  
**Constraint**: Adding a new tier requires: (1) add to `PackageType` union in `packageConfig.ts`, (2) add to `PACKAGE_CONFIGS`, (3) update the sidebar, (4) update helper functions.

---

## 5. No Database-Level Row Security (RLS)

**Decision**: Tenant isolation is enforced at the application query level (`where: { shopId }`) — not Supabase RLS.  
**Why**: RLS with Prisma required injecting the JWT user ID into Postgres sessions on every connection, which was incompatible with the transaction-mode pooler.  
**Risk**: If any route forgets `shopId` in its `where` clause, data from another tenant leaks. This is mitigated by code review. Every new route must call `requireShop(req)` first.

---

## 6. Mill Billing as a Separate `billingMode: 'mill_v2'`

**Decision**: Mill billing (`badaudyog`) uses a separate billing mode, not a variant of `standard`.  
**Why**: Mill bills have GST-exclusive rates, non-GST charges (freight, hamali, commission), and an explicit round-off field. Trying to shoehorn these into `standard` mode would have required Boolean flags on every calculation path.  
**Don't change**: Keep `mill_v2` strictly gated behind `isMillBillingPackage()` — the calculations are fundamentally different.

---

## 7. Job Work Never Touches Product Stock

**Decision**: Job work orders (grain owned by a third party, processed at the mill) never create `RawMaterialLot`, never change `Product.currentStock`, and have no financial entries.  
**Why**: The mill doesn't own that grain — touching the stock would corrupt the mill's own inventory. The grain is tracked only in `JobWorkOrder` and `JobWorkOrderItem`.  
**Don't change**: If a future requirement asks to track job-work grain in inventory, create a separate model, not a flag on the existing pipeline.

---

## 8. Delivery Challan is NOT Financial

**Decision**: Creating a `DeliveryChallan` decrements stock immediately (goods leave the godown) but does NOT book revenue, update customer balance, or create a GST entry.  
**Why**: In Indian trade practice, a challan is a physical goods-movement document, not a tax invoice. The formal `Sale` (with GST invoice) is raised separately — converting the challan to a sale via `billing/route.ts`.  
**Don't change**: Never add financial writes to the challan creation path — it would double-count revenue.

---

## 9. Stock Take Delta (not SET)

**Decision**: Committing a stock take applies `delta = countedQty - systemQty` to current stock — NOT an absolute SET to `countedQty`.  
**Why**: Between session start and commit, sales or purchases may have occurred. A SET would erase those real transactions. The delta preserves them (matches standard inventory counting practice).  
**Trade-off**: If significant sales happened mid-count, the delta still reflects the count discrepancy, which is the correct behaviour.

---

## 10. Worker Threads Disabled (Hostinger shared hosting)

**Decision**: `next.config.js` disables worker threads.  
**Why**: Hostinger shared hosting doesn't support Node.js worker threads. The app runs without them at a minor performance cost.  
**Don't re-enable** without verifying the hosting environment supports it.

---

## 11. In-Memory Auth Cache (short TTL)

**Decision**: `requireShop()` caches the `(userId, sessionId)` → `{ user, shop }` lookup for a few seconds in a module-level Map.  
**Why**: A single page load fires 5–15 parallel API calls, all with the same JWT. Without caching, each makes 2–3 DB round trips, causing connection pool exhaustion under load. The TTL is short enough that a shop switch or session revocation is picked up within seconds.  
**Risk**: Zero in a serverless environment (Map resets per request). Acceptable in the persistent Node process (Electron, Capacitor dev server, Hostinger).
