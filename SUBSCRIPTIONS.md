# Subscriptions (Free Trial → Manual Renewal on PayU)

PayU auto-debit (Standing Instruction / eMandate) is **not** enabled on this
account, so subscriptions use a **manual-renewal** model:

- **Free trial** starts automatically at signup — **7 days**, extended to **14
  days** when the user applies a referral code. No card/payment required.
- After the trial, the user **pays monthly** via a one-time PayU payment to keep
  full access.
- A daily cron sends **renewal reminders** before expiry and marks lapsed
  subscriptions `expired` (it does **not** charge anyone).
- **30-day money-back guarantee** on the last paid charge.

## Flow

1. **Signup** (`POST /api/v1/auth/register`) → shop created with
   `status=trial`, `subscriptionTrialEnds = now + 7d`. New user is sent straight
   into the app.
2. **Referral applied** (`POST /api/v1/referrals/apply`) → if still in trial,
   trial is extended to **14 days** from signup.
3. **Subscribe / renew** — user opens `/payment` → app `/en/payment?plan=X` →
   `POST /api/v1/payments/create-order` builds a **one-time** PayU order for the
   full plan amount → user pays on PayU.
4. **PayU success** (`POST /api/v1/payments/payu-success`) verifies the hash,
   sets `status=active`, `subscriptionExpiry = now + 30d`, logs a
   `PaymentTransaction`, and records `firstChargeDate` (money-back anchor).
5. **Daily cron** (`/api/v1/cron/process-subscriptions`):
   - sends in-app renewal reminders at **3 / 1 / 0 days** before expiry,
   - marks subscriptions **`expired`** once the expiry date passes.
6. **Cancel** (`POST /api/v1/payments/cancel-subscription`) sets `cancelled`
   and, if within **30 days** of the first paid charge, refunds the last payment.

## Access after expiry

`isSubscriptionEnded()` returns true when status is `expired`/`cancelled` or the
expiry date has passed. `MainLayoutClient` then keeps the **core** pages usable
(`/billing`, `/products`, `/stock`, `/settings` — see `ENDED_ALLOWED_PATHS`) and
redirects everything else to `/billing` to renew. The shop's data is never
deleted.

## Endpoints

| Endpoint | Purpose | Auth |
|---|---|---|
| `POST /api/v1/payments/create-order` | Build one-time PayU order | user |
| `POST /api/v1/payments/payu-success` | PayU callback — activate 30 days | PayU hash |
| `POST /api/v1/payments/payu-failure` | PayU callback — failure redirect | PayU hash |
| `POST /api/v1/payments/activate-plan` | Manual/test activation | user |
| `POST /api/v1/payments/cancel-subscription` | Cancel + money-back refund | user |
| `GET/POST /api/v1/cron/process-subscriptions` | Reminders + expiry sweep | `CRON_SECRET` |

## Required env

```
PAYU_KEY=...           # PayU merchant key
PAYU_SALT=...          # PayU merchant salt
CRON_SECRET=...        # long random secret guarding the cron endpoint
APP_URL=https://...    # public app URL (PayU surl/furl target)
```

If `PAYU_KEY`/`PAYU_SALT` are empty the app runs in **test mode**: the payment
page shows a manual "Activate (Test)" button so the lifecycle can be exercised
locally.

## Scheduling the cron

Run **daily** from any scheduler:

```
GET https://<APP_URL>/api/v1/cron/process-subscriptions
Authorization: Bearer <CRON_SECRET>
```

- **Vercel** (`vercel.json`):
  ```json
  { "crons": [{ "path": "/api/v1/cron/process-subscriptions", "schedule": "0 6 * * *" }] }
  ```
- **Render / cron-job.org / GitHub Action**:
  `curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/v1/cron/process-subscriptions`

## Config (`app/lib/server/config.ts`)

```
planAmounts:    { shop: 299, vyapar: 499, wholesale: 999 }  # ₹/month
trialDays:         7    # default free trial
trialDaysReferral: 14   # free trial with a referral code
billingCycleDays:  30   # paid validity per payment
moneyBackDays:     30   # money-back guarantee window
```

## Statuses (`shop.subscriptionStatus`)

`trial` → free trial active ·
`active` → paid & current ·
`expired` → trial/plan lapsed (core-only access) ·
`cancelled` → user cancelled.

## Future: true auto-debit

If you later onboard a gateway with UPI Autopay / eMandate (Razorpay/Cashfree),
the `PaymentTransaction` table, `billing.ts` processor, cron, and mandate fields
already in the `Shop` model (`mandateToken`, `nextBillingDate`, `billingAmount`)
are ready to extend into silent auto-renewal with minimal rework.
