# Udyog (Wholesale)

The **Udyog** package is built for wholesale and distribution rather than
counter retail. It isn't simply "Dukaan with more" — some things work
differently.

The main difference: Udyog replaces **Customers** and **Udhar** with
**Party / Ledger**, which handles customers and suppliers together, with credit
limits and payment terms.

## Party / Ledger

Everyone you trade with — the people who buy from you and the people you buy
from — with their running balance.

- **Add Party** — name, contact and credit terms.
- **Credit terms** — a credit **limit** (or **No Limit**) and payment days, so
  you know when money is due.
- **Total Outstanding** — what's owed across all parties.
- **Collect Payment** — record money received against a party.
- Parties with nothing outstanding show as **Settled**.

Party ledger is the Udyog equivalent of Udhar. If you're used to the udhar
khata, this is the same idea with credit limits added.

## Orders

Orders are what customers have asked for but haven't been billed for yet.

**New Order** records an order number and total amount. The list shows date,
order number, status and amount, so you can track what's still to fulfil.

## Suppliers and Purchases

**Suppliers** is your list of who you buy from.

**Purchases** records goods coming in — what you bought, from whom, and at what
cost. Recording purchases keeps your stock counts and cost prices accurate,
which is what makes profit in [Reports](reports.md) trustworthy.

## Warehouses

Udyog tracks stock across more than one location. For each warehouse you see
**Total Products**, **Total Units**, **Stock Value**, **Low Stock**,
**Out of Stock** and **Expiring Soon**.

From here you can:

- **Transfer Stock** — move goods between warehouses.
- **Receive Purchase** — book incoming goods into a warehouse.
- **Adjust Stock** — correct counts after a physical check.
- **Export** — download the stock position.

**Expiring Soon** is worth watching if you deal in perishables or medicines —
it's the difference between selling stock and writing it off.

## Stock Transfer

Moving stock from one warehouse to another. Both sides update, so your total
stays right and each location shows what it actually holds.

## Dukandar

If you supply retailers, **Dukandar** lets you keep track of them.

- **Add Dukandar** — invite a retailer using **Your Access Code**.
- **Retailers** — the shops you supply.
- **History** — past activity with each one.

Once a retailer is linked, you can see when they're running low and send them a
stock alert or a quotation, rather than waiting for them to call you.

Dukandar management requires the Udyog package.

## Wholesale billing

Billing on Udyog differs from Dukaan and Vyapar in two ways.

**Adding items** — search by name or barcode as usual, or use **Quick Add**
(**Ctrl+K**) to add an item fast without leaving the keyboard. A barcode
scanner works here too. Product suggestions show stock, retail and wholesale
prices side by side, so you can see your margin as you build the bill.

**Payment** — instead of picking one payment method, Udyog lets you **split a
single bill across methods**: enter separate amounts for **Cash**, **UPI** and
**Card**. Whatever is left over becomes **Remaining (Udhar)** on the party's
ledger automatically. If a customer overpays, the app shows **Change Return**.

This suits wholesale, where one large bill is often settled partly now and
partly later, or across two methods at once.

As with retail billing, a customer name is required when any amount remains
outstanding.

## Pricing modes

Udyog products carry both a **retail** and a **wholesale** price. Billing uses
the right one for the sale, so you don't have to remember two price lists.
