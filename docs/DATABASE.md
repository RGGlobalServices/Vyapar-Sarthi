# Database — Vyapar Sarthii ERP & POS

Schema: `prisma/schema.prisma` — single source of truth.

---

## Core Invariant: Tenant Isolation

**Every query must include `where: { shopId: shop.id }`.**  
There is no database-level RLS — isolation is enforced entirely in application code.  
Missing a `shopId` filter is a P0 data-leak bug.

---

## Key Models

### User → Shop (multi-tenancy)

```
User (users)
  id (int PK), uuid, email, password (bcrypt), mobile
  maxShops, canAddShop, allShopAccess, selectedShopIds

Shop (shops)
  id (uuid PK), ownerId → User.uuid
  name, businessType, businessSubtype, businessProducts[]
  packageType: 'dukan' | 'vyapar' | 'wholesale' | 'badaudyog'
  subscriptionPlan, subscriptionStatus, subscriptionExpiry
  invoiceFormat, invoiceTheme, invoiceColor
  gst, pan, fssai, upiId, bankName, bankAccountNumber, bankIfsc
  allowNegativeStock
```

One User can own multiple Shops. All feature data hangs off Shop.

---

### Products & Variants

```
Product (products)
  id (uuid), shopId, name, category, millCategory
  baseUnit, sellingPrice, mrp, costPrice, wholesalePrice
  currentStock          ← FLAT total — derived from variants when variants exist
  size_variants         ← JSON string {"Red / M": 5, "L": 3} — legacy map store
  variants              ← JSON array [{color, size, stock, costPrice, ...}] — primary store
  archived, barcode, hsnCode, gstPercent
```

**Variant stores rule** (`lib/variants.ts`):
- `size_variants` (map) and `variants[]` (array) are MIRRORS — both must stay in sync.
- `currentStock` is always the SUM of all variant stocks when variants exist.
- Use `openVariantStores` → `adjustVariantStores` → `closeVariantStores` for every mutation.
- NEVER update `size_variants` or `variants[]` directly with JSON string operations.

---

### Sales & Billing

```
Sale (sales)
  id, shopId, customerId, totalAmount, paidAmount, paymentMode
  discountAmount, gstAmount, netAmount
  billingMode: 'standard' | 'mill_v2' (badaudyog only)
  status: 'completed' | 'cancelled' | 'draft'
  invoiceNumber, invoiceUrl (Supabase Storage PDF)

SaleItem (sale_items)
  saleId, productId, variantKey (nullable), quantity, price, gstPercent
  discountAmount, unit, unitLabel
```

A cancelled Sale must restore stock and reverse the customer's ledger balance.

---

### Purchases

```
PurchaseInvoice (purchase_invoices)
  id, shopId, supplierId, totalAmount, paidAmount, status
  invoiceNumber, invoiceDate, warehouseId

PurchaseItem (purchase_items)
  invoiceId, productId, variantKey, quantity, costPrice, unit
  conversionFactor (for mill unit conversion, e.g. kg → bags)
  lotId (RawMaterialLot, badaudyog only)
```

Purchases increment `Product.currentStock` (and variant stores when `variantKey` is set).

---

### Stock Take

```
StockTakeSession (stock_take_sessions)
  id, shopId, name, status: 'draft' | 'completed' | 'cancelled'
  startedAt, completedAt

StockTakeItem (stock_take_items)
  sessionId, productId, productName, unit
  variantKey (nullable) — null for plain products, "Color / Size" for variants
  systemQty (snapshot at session start), countedQty (entered by shopkeeper)
```

On commit: variant items use variant stores; plain items use `currentStock: { increment }`.

---

### Customer Ledger (Udhar)

```
Customer (customers)
  id, shopId, name, mobile, customerType, balance (running balance)
  — balance < 0 means customer owes money (credit)
  — balance > 0 means shop owes customer (advance/overpayment)

CustomerTransaction (customer_transactions)
  customerId, shopId, type: 'sale' | 'payment' | 'credit' | 'debit'
  amount, note, saleId (nullable link to Sale)
```

**Invariant**: `Customer.balance` = sum of all transactions for that customer. Maintain on every write.

---

### Suppliers & Expenses

```
Supplier (suppliers)   — Party on the purchase side
  id, shopId, name, mobile, gst, balance

Expense (expenses)
  shopId, category, amount, date, paymentMode, attachmentUrl
```

---

### Mill-Only Models (badaudyog)

```
RawMaterialLot       — grain arriving at gate, weighed and tested
GateEntry            — vehicle + commodity entry at the mill gate
WeighbridgeEntry     — gross/tare/net weight recording
QualityTest          — moisture%, protein%, foreign matter% per lot
ProductionBatch      — raw material → finished goods conversion
ByProduct            — husk, bran, kunda produced as a side output
JobWorkOrder         — processing grain owned by a third party
Machine / Maintenance / SparePart — machine health tracking
FreightEntry         — transport cost per challan/delivery
CommissionEntry      — broker commission per sale/purchase
```

---

### Trash / Recovery

```
DeletedRecord (deleted_records)
  shopId, entityType, entityId, data (JSON snapshot), deletedAt, restoredAt
  purgeWarnedAt — set before purge cron acts (safeguard)
```

Supported: `product`, `customer`, `supplier`, `staff`, `sale`. Restore re-inserts from JSON snapshot.

---

## Migration Rules

1. Edit `prisma/schema.prisma`.
2. Dev: `npm run db:push` (no migration file needed — pushes directly).
3. Production: `npm run db:migrate` (creates versioned migration file in `prisma/migrations/`).
4. Always commit `schema.prisma` alongside the migration SQL.
5. **Never run destructive migrations** (`DROP COLUMN`, `DROP TABLE`) without reviewing live data first.
6. Nullable columns are safe to add without downtime. Non-nullable without a default are not.

---

## Indexes (key ones)

Most foreign-key pairs have a compound index `[shopId, createdAt DESC]` for list queries.  
`Product`: `[shopId]`, `[shopId, archived]`, `[barcode]`.  
`Sale`: `[shopId, createdAt DESC]`, `[customerId]`.  
`StockLog`: `[shopId, productId]`.  

Check `@@index` blocks in schema before adding a slow query — the index may already exist.
