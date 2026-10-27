# Domain Rules — Vyapar Sarthii ERP & POS

Business logic that must never be broken, regardless of refactors.

---

## 1. Stock Management

### Flat vs Variant Products

- **Plain product**: only `currentStock` field matters.
- **Variant product**: `size_variants` (JSON map) + `variants[]` (JSON array) + `currentStock` (sum) are three mirrors. All three must stay in sync on every mutation.

### Variant Mutation — always use these functions (`lib/variants.ts`)

```
openVariantStores(product)          → VariantStoreState
adjustVariantStores(state, key, delta, opts?)  → 'ok' | 'missing' | 'insufficient'
closeVariantStores(state)           → { size_variants?, variants? }  ← write these back
```

Key: `"Color / Size"` or bare size when no color. Case-insensitive match via `normKey()`.  
Never touch `size_variants` JSON directly. Never use exact string match for variant keys.

### Stock Never Goes Negative (by default)

- `allowNegativeStock` on Shop can override this (set via Settings).
- `adjustVariantStores` with `rejectNegative: true` returns `'insufficient'` without mutating.
- The billing route re-checks stock inside the transaction before confirming a sale.

### Stock Logs

Every stock change writes a `StockLog` row with `type: 'in' | 'out'` and a human-readable `note`. This is the audit trail — never skip it.

---

## 2. Billing & Financial Calculations (`lib/financialEngine.ts`)

### Bill Modes

| Mode | Who uses it | GST treatment |
|------|-------------|---------------|
| `standard` | Dukan, Vyapar, Udyog | GST inclusive (sellingPrice already includes GST) |
| `mill_v2` | Bada Udyog only | GST exclusive + non-GST charges (freight, hamali, commission) + round-off |

`isMillBillingPackage(shop.packageType)` gates `mill_v2`.

### GST Calculation (standard mode)

```
taxableValue  = sellingPrice / (1 + gstPercent / 100)
gstAmount     = sellingPrice - taxableValue
netAmount     = sum(lineItems) - discountAmount
```

### Profit Calculation

- Default: `profit = sellingPrice - costPrice` (what the shopkeeper expects).
- If `shop.gstInclusiveProfit = true`: strip GST from sellingPrice first.
- Billing-time profit always nets out GST regardless of the setting (financial accuracy).

### Rounding

- Mill bills: explicit `roundOff` field (nearest rupee, can be negative).
- Standard bills: no rounding — display as-is.

---

## 3. Customer Ledger (Udhar)

- `Customer.balance`: negative = customer owes shop (udhar), positive = shop owes customer.
- Every `Sale` with unpaid amount decreases balance (more debt) or decreases advance.
- Every `CustomerTransaction` of type `payment` increases balance.
- `balance` must be recalculated from transaction history whenever a transaction is deleted/edited. Never just increment/decrement the stored balance without also writing the transaction row.

---

## 4. Purchases

### Non-Mill (Dukan/Vyapar/Udyog)
- Product select from existing catalog, or quick-add (name-only payload).
- On save: increment `Product.currentStock` (and variant stores if `variantKey` set).
- Supplier's balance (payable) increases by unpaid amount.

### Mill (Bada Udyog)
- Purchase creates a `RawMaterialLot` linked to a `GateEntry` / `WeighbridgeEntry`.
- `PurchaseItem.lotId` links the lot.
- Mill purchases track `conversionFactor` (e.g. 1 bag = 50 kg).
- Unit conversion: stored in `baseUnit`, displayed in `unitLabel`.

---

## 5. Returns & Exchanges

### Sales Returns
- Restore stock (call `adjustVariantStores` with positive delta for each returned line).
- Reverse the customer ledger entry (write a `CustomerTransaction` to undo the debt).
- Write `StockLog` entries for each restored item.
- Mark the `MaterialReturn` with `type: 'sales_return'`.

### Exchanges (Billing → Exchange tab)
- Exchange = return old items + bill new items in one transaction.
- The net amount is `newTotal - returnTotal`.
- All stock adjustments happen inside a single Prisma transaction (`$transaction`).
- See `app/api/v1/billing/exchange/route.ts` for the canonical implementation.

---

## 6. Package-Gated Features

Always check `packageType` from the **server-side** `requireShop()` result — never trust a client-supplied value.

| Feature | Minimum package |
|---------|----------------|
| Import (CSV/Excel) | `vyapar` |
| Party ledger, Warehouses, Transfers, Orders | `wholesale` |
| Deliveries tab in Suppliers | `badaudyog` |
| Slips tab in Suppliers | `badaudyog` |
| Mill billing (`mill_v2`) | `badaudyog` |
| Gate Entry, Weighbridge, Production, Quality Lab | `badaudyog` |
| Brokers, Machines, Maintenance, Spare Parts | `badaudyog` |
| Job Work | `badaudyog` |

---

## 7. Job Work (Bada Udyog)

- Job work = processing grain owned by a third party (customer brings grain, mill processes, returns processed output).
- **Never touches `Product.currentStock` or `RawMaterialLot`** — the mill doesn't own that grain.
- Tracked in `JobWorkOrder` only.
- See header comment in `app/[locale]/(main)/job-work/page.tsx`.

---

## 8. Stock Take

- A session snapshots per-variant system quantities at start.
- Variant products get one item per variant key; plain products get one flat item.
- Commit applies `countedQty - systemQty` as a delta via variant stores (not a SET operation).
- Partial counts are valid — uncounted items are left untouched.
- Only one draft session per shop at a time.

---

## 9. Trash / Soft Delete

- Supported entities: `product`, `customer`, `supplier`, `staff`, `sale`.
- A JSON snapshot is stored in `DeletedRecord` before the row is hard-deleted.
- Restore re-inserts from the snapshot.
- Customers use an `archived_` prefix on `customerType` instead (never truly deleted).
- Purge cron warns 7 days before permanent deletion (`purgeWarnedAt`).
- 30-day recovery window enforced by the purge job.

---

## 10. i18n

- Three locales: `en`, `hi`, `mr`.
- New UI string = add to **all three** `messages/*.json` files simultaneously.
- Namespace per feature: `Purchases`, `StockTake`, `MillBilling`, `Suppliers`, etc.
- Never hardcode a user-visible string in JSX.
