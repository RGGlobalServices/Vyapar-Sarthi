# Vyapar Sarthi — App

A comprehensive shop management platform for Kirana (small retail), medical, cosmetics, footwear, apparel, electronics and wholesale businesses in India. Smart billing, inventory, credit (Udhar) management, multi-shop & godowns, AI insights, subscriptions, and multi-language support.

> This repository is the **App** — a single Next.js server that renders the dashboard UI **and** serves the API (`/api/v1/*`).
> The **marketing landing page** lives in a **separate repository** and is deployed independently.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Vyapar Sarthi — App (this repo)             │
│                  Next.js 15 · one server · port 3000         │
├──────────────────────────────────────────────────────────────┤
│  app/[locale]/…   Dashboard UI (billing, products, udhar,    │
│                   reports, godowns, dukandar, admin …)        │
│  app/api/v1/…     REST API as native Route Handlers           │
│                   (auth, shop, products, billing, payments,   │
│                    referrals, notifications, AI, cron …)       │
│        │                                                      │
│        ▼                                                      │
│  Prisma ORM ───────────────►  PostgreSQL (Supabase)           │
└──────────────────────────────────────────────────────────────┘
        ▲
        │ cross-origin API calls (CORS allow-listed)
        │
   Landing page  ──  separate repo, static export, own domain
```

## Project Structure

The repo root **is** the Next.js app (no subfolder):

```
├── app/                      # App Router
│   ├── [locale]/             # Locale-prefixed routes (en / hi / mr)
│   │   ├── (auth)/           #   login, signup
│   │   ├── (main)/           #   Authenticated dashboard
│   │   │   ├── billing/      #     invoices (create, list, detail)
│   │   │   ├── products/     #     product CRUD + detail
│   │   │   ├── stock/        #     stock logs / adjustments
│   │   │   ├── udhar/        #     credit / Udhar book
│   │   │   ├── dukandar/     #     retailer management
│   │   │   ├── godowns/      #     warehouse inventory
│   │   │   ├── reports/      #     reports & analytics
│   │   │   ├── returns/      #     returns / exchanges
│   │   │   ├── import/       #     bulk product import (Excel)
│   │   │   ├── calendar/     #     reminders / events
│   │   │   ├── referral/     #     refer & earn
│   │   │   ├── settings/     #     shop profile & subscription
│   │   │   ├── profile/      #     user profile
│   │   │   └── support/      #     help & support
│   │   ├── admin/            #   Admin panel (login, users, detail)
│   │   ├── dukandar-alerts/  #   Stock alerts to/from retailers
│   │   ├── dukandar-credit/  #   Credit given to retailers
│   │   └── payment/          #   In-app PayU checkout / plan switch
│   │
│   └── api/v1/               # ◄── THE BACKEND (Route Handlers)
│       ├── auth/  shop/  products/  billing/  customers/
│       ├── dukandar/  godowns/  reports/  payments/
│       ├── referrals/  notifications/  support/  admin/
│       ├── ai/                # chat assistant, insights
│       └── cron/              # subscription reminders & expiry
│
├── components/               # Shared UI (Sidebar, BillSlip, charts…)
├── lib/
│   ├── server/               # Server-only: prisma, auth, payu, ai,
│   │                         #   billing, email, whatsapp, godowns…
│   ├── api.ts                # Browser API client (JWT, x-shop-id)
│   ├── businessConfig.ts     # 7 business-type presets
│   ├── businessStore.ts      # Multi-shop state (zustand)
│   └── subscriptionAccess.ts # Access gating when subscription ends
├── prisma/schema.prisma      # Database schema (24 models)
├── i18n/  messages/          # next-intl config + en/hi/mr translations
├── hooks/  electron/         # React hooks · Electron desktop shell
├── public/                   # Static assets
├── next.config.js            # serverExternalPackages (prisma, bcrypt…)
├── middleware.ts             # Auth routing, CORS, locale, plan gate
├── capacitor.config.ts       # Capacitor (Android/iOS) config
├── supabase/                 # SQL schema + RLS + storage migrations
└── .env.example
```

## Features

### For Shop Owners
- **Smart Billing** — GST-ready invoices, discounts, partial payments, PDF + WhatsApp sharing
- **Inventory** — stock in/out, low-stock alerts, expiry tracking, barcode/QR
- **Udhar Book** — digital credit ledger with WhatsApp/PDF reminders
- **Multi-Shop & Godowns** — multiple shops/warehouses, stock transfers
- **Dukandar (Retailer) Management** — credit tracking, stock alerts, quotations (wholesale)
- **AI Assistant & Insights** — chat assistant, sales analytics, demand/pricing hints
- **Reports** — daily/monthly sales, profit, top products, trends, Excel export
- **Bulk Import**, **Returns**, **Calendar reminders**, **Referral program**
- **Multi-language** (English, Hindi, Marathi) and **7 business types**

### For Admin
- Platform analytics, user management (block/activate/delete), subscription control, broadcast notifications, referral oversight.

## Subscriptions & Pricing

New users get a **free trial automatically at signup** (no card). After the trial they renew manually via PayU with reminders (no silent charges). See [SUBSCRIPTIONS.md](SUBSCRIPTIONS.md).

| Plan | Key | Price | For |
|------|-----|-------|-----|
| **Dukaan** | `shop` | ₹299/mo | Small kirana, grocery & retail |
| **Vyapar** | `vyapar` | ₹499/mo | Growing shops with branches |
| **Udyog** | `wholesale` | ₹999/mo | Wholesalers & distributors |

- Trial: 7 days standard, **14 days** with a referral code
- Plan switching is free during an active trial; after the trial it requires payment
- **30-day money-back guarantee**; statuses: `trial` → `active` → `expired` / `cancelled`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| App (UI + API) | Next.js 15 (App Router + Route Handlers), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Database / ORM | PostgreSQL (Supabase) · Prisma 6 |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Payments | PayU India (one-time, hash-verified) |
| AI | OpenRouter (default) / Google Gemini |
| Email | Nodemailer (SMTP) |
| State | Zustand |
| i18n | next-intl (en, hi, mr) |
| Mobile / Desktop | Capacitor (Android/iOS) · Electron |

## Data Model (Prisma)

`User`, `Shop`, `PaymentTransaction`, `Product`, `Customer`, `Sale`, `SaleItem`, `StockLog`, `Godown`, `GodownProduct`, `customer_transactions`, `CalendarEvent`, `ReferralCode`, `Referral`, `DukandarRelationship`, `DukandarStockAlert`, `DukandarCredit`, `SupportTicket`, `ToolUsage`, `PushSubscription`, `NotificationSetting`, `UserNotification`, `AdminNotification`, `AdminUser`.

## Environment Variables

Full template in [.env.example](.env.example). Key vars:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `SECRET_KEY` | JWT signing secret | ✅ |
| `ADMIN_SECRET_KEY` | Required to register an admin | ✅ |
| `NEXT_PUBLIC_API_URL` | API base for the browser (`/api/v1` same-origin, or absolute) | ✅ |
| `NEXT_PUBLIC_FRONTEND_URL` / `FRONTEND_URL` / `APP_URL` | App public URL | ✅ |
| `NEXT_PUBLIC_LANDING_URL` / `LANDING_URL` | Landing page URL (CORS + plan-gate redirect) | ✅ |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | AI assistant | optional |
| `SMTP_*`, `SUPPORT_EMAIL` | Email | optional |
| `PAYU_KEY` / `PAYU_SALT` | Subscriptions | optional |
| `CRON_SECRET` | Guards the subscription cron endpoint | optional |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Supabase storage | optional |

> ⚠️ `NEXT_PUBLIC_*` are **baked at build time** — set them before `npm run build` and rebuild after any change.

## Local Development

### Prerequisites
Node.js 20+, a PostgreSQL database (Supabase or local), npm.

```bash
git clone https://github.com/RGGlobalServices/Vyapar-Sarthi.git
cd Vyapar-Sarthi

cp .env.example .env.local      # edit DATABASE_URL, SECRET_KEY, URLs

npm install                     # also runs `prisma generate`
npx prisma db push              # create tables
npm run dev                     # http://localhost:3000
```

The dev server reads `.env.local` from the repo root (via dotenv-cli).

### Scripts
```bash
npm run dev          # dev server (port 3000)
npm run build        # production build
npm start            # start production build
npm run lint         # eslint
npm run db:push      # prisma db push
npm run db:generate  # prisma generate
npm run db:migrate   # prisma migrate dev
```

### Access
- App: `http://localhost:3000` · API: `http://localhost:3000/api/v1/...`
- Admin: `http://localhost:3000/en/admin/login`

## Deployment

This repo deploys as **one Next.js server**. The repo root is the app, so deployment is straightforward — no subfolder configuration.

### Option 1: Hostinger managed Deployments (PaaS)

| Field | Value |
|-------|-------|
| Framework preset | Next.js |
| Root directory | `./` |
| Build command | `npm run build` |
| Output directory | `.next` |
| Package manager | npm |
| Node version | 20.x or 22.x |

**Env vars:** set `DATABASE_URL`, a strong `SECRET_KEY`, `ADMIN_SECRET_KEY`, `NEXT_PUBLIC_API_URL` (`/api/v1`), `NEXT_PUBLIC_FRONTEND_URL`/`FRONTEND_URL`/`APP_URL` (app domain), `NEXT_PUBLIC_LANDING_URL`/`LANDING_URL` (landing domain), plus optional PayU/SMTP/OpenRouter/`CRON_SECRET`.

After first deploy, create tables by running `npx prisma db push` once against the production `DATABASE_URL` (e.g. from your machine).

> If a build ever fails with `@parcel/watcher` / "Failed to load next.config" — this repo uses a **JS** config (`next.config.js`) specifically to avoid that. Ensure optional deps aren't omitted (`NPM_CONFIG_INCLUDE=optional`).

### Option 2: Hostinger VPS (self-managed)

Ubuntu VPS with Nginx + PM2 + Let's Encrypt. Summary:

```bash
# install Node 20, git, nginx, pm2 (see prior notes)
git clone https://github.com/RGGlobalServices/Vyapar-Sarthi.git
cd Vyapar-Sarthi
nano .env.production            # all vars (NEXT_PUBLIC_* must be set before build)
npm install
npx prisma db push
npm run build
pm2 start npm --name vyapar-app -- start    # next start on port 3000
pm2 save && pm2 startup
```

Then reverse-proxy `app.yourdomain.com` → `127.0.0.1:3000` in Nginx, add HTTPS with `certbot --nginx`, and schedule the subscription cron:

```cron
0 2 * * * curl -s -H "Authorization: Bearer <CRON_SECRET>" https://app.yourdomain.com/api/v1/cron/process-subscriptions > /dev/null 2>&1
```

### Option 3: Docker / any Node host

A `Dockerfile` is included (builds from the repo root). Or on any Node 20 host: `npm install && npm run build && npm start` (port 3000) behind a reverse proxy.

### First admin account
```bash
curl -X POST https://<app-domain>/api/v1/admin/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Admin","email":"admin@example.com","password":"strong-pass","secretKey":"<ADMIN_SECRET_KEY>"}'
```

## API Reference

All endpoints under `/api/v1`. Auth via `Authorization: Bearer <JWT>`; multi-shop requests include `x-shop-id` (handled by the client).

| Area | Examples |
|------|----------|
| Auth | `POST /auth/register` · `/auth/login` · `/auth/verify-otp` · `/auth/forgot-password` · `/auth/reset-password` |
| Shop | `GET/PATCH /shop/profile` · `POST /shop/create` · `GET /shop/my-shops` · `POST /shop/switch-plan` |
| Products | `GET/POST /products` · `GET/PATCH/DELETE /products/[id]` · `POST /products/[id]/adjust` · `GET /products/logs/all` |
| Billing | `GET/POST /billing` · `GET /billing/[identifier]` · `POST /billing/returns` · `POST /billing/send-bill` |
| Customers | `GET/POST /customers` · `/customers/[id]` · `/customers/[id]/transactions` |
| Godowns | `GET/POST /godowns` · `/godowns/[id]/inventory` · `POST /godowns/transfer` |
| Dukandar | `/dukandar/add-dukandar` · `/dukandar/credit/*` · `/dukandar/send-stock-alert` · `/dukandar/respond-alert` |
| Reports | `/reports/summary` · `/reports/sales-trend` · `/reports/top-products` · `/reports/low-stock` · `/reports/export` |
| AI | `POST /ai/chat` · `GET /ai/insights` |
| Payments | `POST /payments/create-order` · `/payments/payu-success` · `/payments/cancel-subscription` · `/payments/refund` |
| Cron | `GET /cron/process-subscriptions` (CRON_SECRET protected) |
| Admin | `POST /admin/login` · `/admin/register` · `GET /admin/analytics` · `/admin/users` · `PATCH /admin/users/[id]/plan` |

## Use Cases

Kirana/grocery, medical/pharmacy (expiry & batches), cosmetics/footwear/apparel (size & variant grids), electronics (EMI billing), wholesale/distribution (multi-godown + retailer credit), and multi-location businesses run from one account.

---

See [SUBSCRIPTIONS.md](SUBSCRIPTIONS.md) for the detailed subscription, trial, and billing flow.
