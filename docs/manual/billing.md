# Billing

Billing is where you make a bill and take payment.

Billing looks different on Udyog (wholesale) than on Dukaan and Vyapar. This
page describes **Dukaan and Vyapar**. For Udyog, see
[Udyog (Wholesale)](udyog-wholesale.md#wholesale-billing).

## Adding items to the cart

**Search** — type the product's name or barcode into the search box. Matching
products appear below; click one to add it. Search is forgiving of small
spelling mistakes.

**Barcode scanner** — if you have a barcode scanner connected, just scan. The
app detects the scanner typing and adds the item straight to the cart. You do
not need to click anything first.

**Manual Add** — for something not in your catalogue. Enter a name, price and
unit and it is added to this bill only. It is not saved to your product list.
Depending on your business category you may also get a size/variant field.

If you scan a barcode the app doesn't recognise, it tells you the product was
not found and offers to create it.

### The cart

Each row shows the item, unit, quantity, price and total. You can:

- Change the **quantity** or the **price** directly in the row.
- Remove a row with the delete button.
- Tick rows to delete several at once, or clear the whole cart.

For loose goods sold by weight, quick buttons help you add common amounts such
as 250g or 500g.

Electronics shops also see **Warranty** and **Serial #** columns.

**Calculator** — opens a calculator, so you don't need a separate one at the
counter.

## Taking payment

On the right you'll see the bill summary:

- **Subtotal** — the items added up.
- **Discount** — type a rupee amount to take off.
- **Total** — what the customer owes.

Below that, **Payable Amount** and four payment buttons:

| Button | What happens |
|---|---|
| **Cash** | The full bill is paid in cash |
| **UPI** | The full bill is paid by UPI |
| **Card** | The full bill is paid by card |
| **Udhar** | The bill goes on the customer's credit ledger |

Tap one — that's the whole payment step. The status line underneath confirms
what will be recorded, for example "Paid by Cash".

### Udhar — pay now, pay later

When you choose **Udhar**, an orange box appears with:

- **Pay Now** — how much the customer is paying right now. Leave it empty (or
  zero) and the whole bill goes on udhar.
- **Received via** — appears once you enter an amount. Choose whether that
  money came as **Cash**, **UPI** or **Card**. This matters: only cash counts
  towards your cash drawer, so picking the right one keeps your day-end
  totals correct.
- **Pay Later (Udhar)** — the balance, worked out for you. This is what gets
  added to the customer's ledger.

The status line shows **Unpaid / Udhar**, **Partially Paid** or **Fully Paid**
depending on what you entered.

A customer name is required for any bill with an amount outstanding — the app
will not let you save an udhar bill without one.

### EMI (Electronics shops)

Electronics shops can sell on EMI. You set a down payment, the number of
months and an interest rate, and the app works out the monthly instalment. The
bill records the down payment as paid today and tracks the rest.

## Finishing the bill

Click **Confirm Sale**. The **Customer Details** window opens showing a summary
of the bill and payment. Enter:

- **Customer Name** — required for udhar, optional otherwise. Start typing and
  existing udhar customers are suggested; pick one to link the bill to their
  ledger.
- **Mobile Number** — optional. Needed to send the bill on WhatsApp.
- **Email** — optional. Needed to email the bill.

Confirm, and the bill is recorded. Stock is reduced automatically, and any
outstanding amount is added to the customer's udhar.

## Sharing the bill

Once saved, the bill slip appears. From here you can:

- **Print** the receipt.
- **Download** it as a PDF.
- **Share on WhatsApp** — opens WhatsApp with the bill details ready to send.
- **Email** it to the customer.

If you entered a mobile number or email, the Vyapar and Udyog packages send the
bill automatically. On Dukaan you share it yourself from these buttons.

Your bill layout (thermal or A4), your GST/PAN details, a QR code and a footer
message are all set in [Settings & Profile](settings-and-profile.md).

## Finding old bills

Open **Invoices** from Billing to see past bills. You can open any bill to view,
reprint or share it again. To take items back, see [Returns](returns.md).
