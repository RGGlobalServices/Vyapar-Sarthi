# API Contracts — Vyapar Sarthii ERP & POS

Base path: `/api/v1/`  
All routes require `Authorization: Bearer <jwt>` header (except `/auth/*`).  
Every shop-scoped route requires `x-shop-id: <shopId>` header — sent automatically by `lib/api.ts` from the Zustand store.

---

## Authentication

### POST /auth/login
```json
Request:  { "email": "...", "password": "..." }
Response: { "access_token": "...", "token_type": "bearer", "user": { id, email, name, storeName, mobile } }
```

### POST /auth/logout
Invalidates the server-side session. Returns `{ success: true }`.

### POST /auth/forgot-password / POST /auth/reset-password
OTP-based password reset. Email → OTP → new password.

---

## Shop / Profile

### GET /shop/:id
Returns full shop profile including `packageType`, subscription status, invoice settings.

### PATCH /shop/:id
Update shop fields (name, address, GST, invoice settings, etc.).

### POST /shop/create
Creates a new Shop for the authenticated user. Returns the new shop object.

### GET /shop/today-profit
Returns `{ revenue, cost, profit, date }` for the active shop today.

---

## Products

### GET /products
Query params: `search`, `category`, `archived`, `page`, `limit`  
Returns paginated product list with `currentStock`, `variants`, `size_variants`.

### POST /products
Create a product. Minimal payload for Dukan/Vyapar:
```json
{ "name": "Shirt", "currentStock": 0, "sellingPrice": 250 }
```
Full payload for Bada Udyog (mill):
```json
{ "name": "Basmati Rice", "category": "Raw Material", "millCategory": "raw_material", "baseUnit": "kg", "sellingPrice": 0 }
```

### GET /products/:id
Full product detail including variants, stock logs, purchase history.

### PATCH /products/:id
Update product fields. To update variants, send `variants` array — the route reconciles both stores.

### DELETE /products/:id
Moves to trash (`DeletedRecord`). Does NOT hard-delete immediately.

### GET /products/:id/erp-details
ERP-specific fields: HSN code, GST%, reorder level, warehouse assignments.

### POST /products/unsynced
Mobile offline sync endpoint — returns products changed since `lastSyncedAt`.

---

## Billing (Sales)

### POST /billing
Create a sale. Key fields:
```json
{
  "customerId": "...",           // optional (walk-in if omitted)
  "items": [
    { "productId": "...", "variantKey": "Red / M", "quantity": 2, "price": 500, "gstPercent": 5 }
  ],
  "paidAmount": 1000,
  "paymentMode": "cash",
  "discountAmount": 0,
  "billingMode": "standard"      // or "mill_v2" (badaudyog only)
}
```
Returns the created `Sale` with `invoiceNumber`.

### GET /billing/:id
Full sale detail with items, payment info, customer snapshot.

### DELETE /billing/:id
Cancels a sale: restores stock, reverses customer ledger. Writes a `DeletedRecord` snapshot.

### POST /billing/exchange
Exchange: return old items + bill new items atomically.
```json
{
  "saleId": "...",              // original sale
  "returnItems": [{ "productId": "...", "variantKey": null, "quantity": 1 }],
  "newItems": [{ "productId": "...", "variantKey": "Blue / L", "quantity": 1, "price": 600 }],
  "paidAmount": 100
}
```

---

## Customers

### GET /customers
Returns customer list with `balance`.

### POST /customers
Create customer: `{ name, mobile, customerType?, openingBalance? }`.

### GET /customers/:id/history
Transaction history for the customer's ledger.

### POST /customers/:id/transactions/bulk
Bulk add/update transactions (used by import).

---

## Suppliers

### GET /suppliers
Returns supplier list with outstanding payable balance.

### POST /suppliers/payments
Record a payment to a supplier.

---

## Purchases

### POST /purchases
Create a purchase invoice. On save, increments product stock.
```json
{
  "supplierId": "...",
  "items": [
    { "productId": "...", "variantKey": "Rani / 26", "quantity": 10, "costPrice": 150, "unit": "Pcs" }
  ],
  "paidAmount": 0,
  "invoiceDate": "2026-10-25"
}
```

### PATCH /purchases/:id
Update or mark as paid.

---

## Stock

### GET /stock/movements
Stock log history: `[{ productId, productName, type, quantity, note, createdAt }]`

### POST /stock/adjustments
Manual stock adjustment (Stock In / Stock Out):
```json
{ "productId": "...", "variantKey": null, "type": "in", "quantity": 5, "note": "Found extra" }
```

---

## Stock Take

### POST /stock-take
Start a new session. Snapshots every non-archived product's current stock (per variant for variant products).  
Returns the session object with all `items[]`.

### GET /stock-take/:id
Full session with all items and their `countedQty`.

### PATCH /stock-take/:id
Three actions:

**Count (autosave):**
```json
{ "action": "count", "itemId": "...", "countedQty": 8 }
```

**Commit (apply all variances):**
```json
{ "action": "commit" }
```
Applies deltas via variant stores for variant items. Plain items use `currentStock increment`.

**Cancel:**
```json
{ "action": "cancel" }
```

---

## Reports

### GET /reports/summary
Dashboard totals: sales, expenses, profit, stock value for a date range.

### GET /reports/top-products
Top-selling products by quantity or revenue.

### GET /reports/top-buyers
Top customers by purchase amount.

### GET /reports/low-stock
Products below their reorder level.

### GET /reports/sales-trend
Daily/weekly/monthly revenue trend data.

---

## Mill-Only Endpoints (`/mill/`)

Available only when `packageType === 'badaudyog'`. All gated server-side by `isMillBillingPackage()`.

| Route | Purpose |
|-------|---------|
| POST /mill/gate-entry | Vehicle + commodity arrival |
| POST /mill/weighbridge | Gross/tare/net weight recording |
| POST /mill/quality-test | Moisture%, protein%, foreign matter% |
| POST /mill/raw-material/lots | Create a raw material lot |
| POST /mill/production | Production batch: raw → finished |
| GET /mill/by-products | Husk, bran, kunda inventory |
| POST /mill/job-work | Third-party grain processing order |

---

## Error Format

All errors return:
```json
{ "error": "Human-readable message", "code": 400 }
```

Common status codes:
- `400` Bad request / validation error
- `401` Not authenticated (missing/invalid JWT)
- `403` Not authorised (wrong shop or package tier)
- `404` Resource not found
- `409` Conflict (e.g. draft stock take already open)
- `500` Internal server error

---

## Frontend ↔ Backend Compatibility

- The frontend axios instance (`lib/api.ts`) automatically adds `Authorization` and `x-shop-id` headers from the Zustand store.
- SWR hooks in `lib/hooks/` call these endpoints. The key always includes `activeShopId` so data refetches on shop switch.
- Never call `/api/v1/*` directly from client components — use the SWR hooks or `api.post/get/patch/delete`.
