# Products & Stock — Fields by Business Category

What you're asked to fill in when adding a product or managing stock changes
based on your shop's **Business Category** (set in Profile / shop setup).
This page documents exactly what appears for each of the 8 categories, so you
know what to expect and why.

> This describes the **Vyapar Sarthi** side of the app (all three packages —
> Dukaan, Vyapar, Udyog). See [Products](products.md) and [Stock](stock.md)
> for the general workflow; this page is the field-by-field reference.

## The 8 business categories

| Category | Shown as |
|---|---|
| `kirana` | Kirana / Grocery |
| `medical` | Medical / Pharmacy |
| `boutique` | Boutique / Cosmetics |
| `shoes` | Shoes / Footwear |
| `clothes` | Clothes / Textiles |
| `electric` | Electric / Hardware |
| `electronics` | Electronics |
| `general` | General Wholesale |

---

## Fields every category always has

These appear on the **Add Product** form no matter what business category
you're on.

| Field | Notes |
|---|---|
| Product Name | Free text. The placeholder example changes per category (e.g. "Tata Salt (1kg)" for Kirana, "Paracetamol 500mg" for Medical). |
| Category | A dropdown of suggestions specific to your business type (see each section below), or type your own. |
| Unit | A dropdown specific to your business type — e.g. Kg/Ltr/Packet for Kirana, Pair for Shoes, Strip/Vial for Medical. |
| Loose Material toggle | Turn on if this item is sold by cutting/measuring from bulk (e.g. loose rice, loose oil) rather than as fixed packs. |
| Opening Stock | How many/much you have right now. |
| Minimum Stock Level | Triggers the Low Stock warning — see [Stock](stock.md). |
| MRP | Printed price. |
| Selling Price | What you actually charge — used in billing. |
| Cost Price | What you paid — used to calculate profit in [Reports](reports.md). |
| Barcode | Scan with your camera, or type it manually. |
| HSN Code | For GST invoices — see [Billing](billing.md). Optional if you never bill GST. |
| GST % | The tax rate for this product. Required for a GST invoice to show a real tax breakdown instead of the "no GST % set" notice. |

## Fields every category always has — Stock

| Field | Notes |
|---|---|
| Product | Pick from your existing catalogue. |
| Quantity | How much is going in or out. |
| Note / Reason | Optional free text — why the stock changed (useful for Stock Out: damage, expiry, correction). |

Stock In/Out for a product **not yet in your catalogue** opens the same
extended form as Add Product (all the category-specific fields below apply
there too).

---

## Extra fields per category

| Category | Extra Product fields | Extra Stock behaviour |
|---|---|---|
| Kirana | Net-weight/volume size variants (optional) | Per-size stock if variants used |
| Medical | Batch Number, Drug Schedule (OTC/Rx/H1/H2), Expiry Date (**required**) | Expiry-based alerts |
| Boutique | Shade/Finish variant (auto, by category), Expiry Date (optional) | Per-shade stock |
| Shoes | Gender, Sole Material, Colour × Size grid (required) | Per size+colour stock, size-level low-stock |
| Clothes | Gender, Fabric/Material, Colour × Size grid (required) | Per size+colour stock, size-level low-stock |
| Electric | Model Number, Warranty, Wire/Voltage/Wattage specs (auto, by category) | Per-spec stock where applicable |
| Electronics | Model Number, Warranty | — |
| General Wholesale | Whatever combination applies to the typed category — see below | Matches whichever fields that category triggers |

---

## Kirana / Grocery

**Product categories offered:** Atta & Flours, Rice & Rice Products, Dals &
Pulses, Edible Oils, Ghee, Sugar & Jaggery, Spices & Masalas, Tea, Coffee,
Biscuits & Snacks, Dairy, Personal Care, Cleaning, Baby Care, Pet Food,
Stationery, and more — 50 built-in categories, or type your own.

**Units offered:** Kg, Gram, Ltr, ML, Packet, Box, Bottle, Piece, Dozen,
Pouch, Carton, Sachet, Tube, Can, Bundle, Unit.

**Extra field:** an optional **net-weight/volume size** — for items you sell
in multiple pack sizes (e.g. 100g / 250g / 500g / 1kg of the same product).
When used, stock and pricing are tracked separately per size.

No expiry, batch, or warranty fields — Kirana keeps the form short.

## Medical / Pharmacy

**Product categories offered:** Tablet, Capsule, Syrup, Suspension,
Injection, Drops, Cream/Ointment, Gel, Inhaler, Powder, Vitamins,
Supplements, Ayurvedic, Surgical, and more.

**Units offered:** Strip, Bottle, Box, Vial, Tube, Packet, Unit.

**Extra fields:**

| Field | Required? |
|---|---|
| Batch Number | Optional |
| Drug Schedule | Optional (OTC / Rx / H1 / H2) |
| Expiry Date | **Required** — the only category where this is mandatory |

Typing a category that implies a form (e.g. "Paracetamol Tablet") also
offers a **Strength × Pack** variant grid (e.g. 500mg, in packs of 10/15/20/30
tablets), auto-detected from the category name.

**Why expiry is mandatory here:** pharmacy stock has real expiry risk, and
the dashboard's expiry alerts depend on this being filled in for every item.

## Boutique / Cosmetics

**Product categories offered:** Lipstick, Lip Gloss, Foundation, Concealer,
Nail Polish, Kajal, Eyeliner, Mascara, Perfume, Deodorant, Skincare, Face
Wash, Moisturizer, Shampoo, Hair Oil, and more.

**Units offered:** Piece, Bottle, Set.

**Extra field:** typing a recognised category (lipstick, foundation, nail
polish, perfume, skincare, etc.) auto-offers a **Finish/Type × Shade** or
**Type × Volume** variant grid — for example "Lipstick" gets Finish (Matte /
Creamy / Glossy) × Shade (Red / Pink / Nude…), while "Perfume" gets Type ×
Volume (30ml / 50ml / 100ml…). Expiry Date is available but optional.

## Shoes / Footwear

**Product categories offered:** Sports Shoes, Formal Shoes, Sandals,
Slippers, Boots, Casual Shoes, Kids Shoes.

**Units offered:** Pair.

**Extra fields:**

| Field | Notes |
|---|---|
| Gender | Men / Women / Kids / Unisex |
| Sole Material | Free text |
| Colour × Size grid | **Required** — stock is entered per colour+size combination (e.g. Black UK9, Brown UK8), not as one flat number |

Sizes offered: UK4–UK12. Colours offered: Black, White, Brown, Tan, Blue,
Red, Grey, Navy (or type your own). Each colour+size cell can carry its own
price if you charge differently by size.

## Clothes / Textiles

**Product categories offered:** T-Shirt, Shirt, Pant, Jeans, Saree, Kurta,
Dress, Jacket, Dress Material, and more.

**Units offered:** Piece, Meter, Set.

**Extra fields:**

| Field | Notes |
|---|---|
| Gender | Men / Women / Kids / Unisex |
| Fabric / Material | Free text (e.g. Cotton, Silk, Polyester) |
| Colour × Size grid | **Required** — same per-combination stock model as Shoes |

Sizes offered: XS–XXXL. Colours offered: Black, White, Red, Blue, Green,
Yellow, Pink, Grey, Maroon, Navy (or type your own).

## Electric / Hardware

**Product categories offered:** Bulbs & LEDs, Wires & Cables, Switches &
Boards, MCB & Distribution, Fans, Geyser, Inverter, Battery, Water Pump,
Pipes & Conduits, Tools, and more.

**Units offered:** Piece, Meter, Box, Coil.

**Extra fields:**

| Field | Notes |
|---|---|
| Model Number | Optional |
| Warranty | Optional, in months |

**Auto-detected spec matrix:** typing a recognised category offers a
two-dimension variant grid tailored to what it is — for example "Wire"
becomes Material × Gauge (Copper/Aluminium × 0.5mm–16mm), "Bulb" becomes
Type × Watt, "Battery" becomes Battery Type × Capacity (Ah), "Switch" becomes
Type × Rating (Amps). Over 25 category-specific spec rules are built in;
anything unrecognised falls back to a plain single-stock item.

## Electronics

**Product categories offered:** Mobile, Laptop, TV, Camera, Earphones,
Speaker, Power Bank, Smartwatch, plus large appliances — Microwave, AC,
Refrigerator, Washing Machine, and more.

**Units offered:** Piece, Box, Set, Unit.

**Extra fields:**

| Field | Notes |
|---|---|
| Model Number | Optional |
| Warranty | Optional, in months — also drives the warranty-expiry dashboard alert |

Uses the same **auto-detected spec matrix** as Electric/Hardware — "Mobile"
becomes RAM × Storage, "TV" becomes Type × Screen Size, "AC" becomes Type ×
Capacity (Ton), and so on, resolved from the category you type.

This is also the only category where [Billing](billing.md) offers **EMI** as
a payment method.

## General Wholesale

For a wholesale business that doesn't fit neatly into one category above.

**Product categories offered:** a short generic starter list (Shirt, Pant,
Footwear, Lipstick, Perfume, LED Bulb, Mixer Grinder, Battery, Hardware,
Kitchenware, and more) — but you're expected to type your own category names
freely.

**Units offered:** Piece, Box, Unit, Kg, Ltr.

**Extra fields:** none fixed — instead, the **auto-detected spec matrix**
adapts to whatever you type. Type "Shirt" and you get Colour × Size; type
"LED Bulb" and you get Type × Watt; type "Lipstick" and you get Finish ×
Shade; type "Battery" and you get Battery Type × Capacity. It recognises
apparel, footwear, cosmetics, and appliance/electrical category names all in
one place, since a general wholesaler's catalogue can span all of them.

---

## The auto-detected spec matrix, explained

Several categories (Boutique, Electric, Electronics, General Wholesale, and
Medical for devices) don't ask about variants directly. Instead, when you
type a category name, the app matches it against known keywords and offers
the right two-dimension grid automatically:

- **"Hair Dryer"** → Type (Foldable/Professional/Ionic) × Watt
- **"Mixer Grinder"** → Type × Watt
- **"Inverter Battery"** → Battery Type × Capacity (Ah)
- **"LED Bulb"** → Type × Watt
- **"Paracetamol Tablet"** (Medical) → Strength × Pack size
- **"Cotton Saree"** (General) → Colour × Size

If nothing matches, the product is treated as a simple item with one stock
number — no grid appears. You're never forced into a variant grid you don't
need.
