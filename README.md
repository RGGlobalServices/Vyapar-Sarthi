# Vyapar Sarthi

A comprehensive shop management platform for Kirana (small retail), medical, cosmetics, footwear, apparel, electronics and wholesale businesses in India. Provides smart billing, inventory tracking, credit (Udhar) management, multi-shop & godown control, AI-powered insights, subscriptions, and multi-language support.

## Architecture

The platform is **two deployable parts** plus a database:

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Vyapar Sarthi Platform                         │
├────────────────────────────────┬─────────────────────────────────────┤
│           landing-page/         │                 app/                 │
│      (Next.js static export)    │     (Next.js — UI + API together)    │
│           dev: port 3001        │            dev: port 3000            │
│                                 │                                      │
│   Marketing / Pricing /         │   Dashboard, Billing, Inventory,     │
│   Blog / Legal / Auth pages /   │   Udhar, Reports, Admin panel        │
│   Subscription checkout         │        +                             │
│                                 │   /api/v1/*  Route Handlers          │
│   Builds to static `out/`,      │   (auth, shop, products, billing,    │
│   served by any web server      │    payments, AI, cron …)             │
│                                 │        │                             │
│                                 │        ▼                             │
│                                 │   Prisma ORM ──► PostgreSQL (Supabase)│
└────────────────────────────────┴─────────────────────────────────────┘
```

> **Note:** there is no separate backend server anymore. The API lives **inside** `app/` as native Next.js Route Handlers under `app/app/api/v1/*`. A single `next start` process serves both the dashboard UI and the API.

## Project Structure

```
├── app/                              # Unified Next.js app (UI + API)
│   ├── app/
│   │   ├── [locale]/                 # Locale-prefixed routes (en / hi / mr)
│   │   │   ├── (auth)/               # login, signup
│   │   │   ├── (main)/               # Authenticated dashboard routes
│   │   │   │   ├── billing/          #   Invoices (create, list, detail)
│   │   │   │   ├── products/         #   Product CRUD + detail
│   │   │   │   ├── stock/            #   Stock logs / adjustments
│   │   │   │   ├── udhar/            #   Credit / Udhar book
│   │   │   │   ├── dukandar/         #   Retailer (dukandar) management
│   │   │   │   ├── godowns/          #   Warehouse / godown inventory
│   │   │   │   ├── reports/          #   Sales reports & analytics
│   │   │   │   ├── returns/          #   Returns / exchanges
│   │   │   │   ├── import/           #   Bulk product import (Excel)
│   │   │   │   ├── calendar/         #   Reminders / events
│   │   │   │   ├── referral/         #   Refer & earn
│   │   │   │   ├── settings/         #   Shop profile & subscription
│   │   │   │   ├── profile/          #   User profile
│   │   │   │   └── support/          #   Help & support
│   │   │   ├── admin/                # Admin panel (login, users, detail)
│   │   │   ├── dukandar-alerts/      # Stock alerts to/from retailers
│   │   │   ├── dukandar-credit/      # Credit given to retailers
│   │   │   └── payment/              # In-app PayU checkout / plan switch
│   │   │
│   │   └── api/v1/                   # ◄── THE BACKEND (Route Handlers)
│   │       ├── auth/                 #   register, login, OTP, reset
│   │       ├── shop/                 #   profile, create, my-shops, switch-plan
│   │       ├── products/             #   CRUD, stock adjust, logs
│   │       ├── billing/              #   invoices, returns, send-bill
│   │       ├── customers/            #   customers + transactions
│   │       ├── dukandar/             #   retailers, credit, stock alerts
│   │       ├── godowns/              #   warehouses, inventory, transfers
│   │       ├── reports/              #   summary, trends, exports, AI context
│   │       ├── payments/             #   PayU order / success / cancel / refund
│   │       ├── referrals/            #   referral codes & team
│   │       ├── notifications/        #   in-app + push notifications
│   │       ├── support/              #   support tickets (+ admin)
│   │       ├── admin/                #   analytics, user & plan management
│   │       ├── ai/                   #   chat assistant, insights
│   │       └── cron/                 #   subscription reminders & expiry
│   │
│   ├── components/                   # Shared UI (Sidebar, BillSlip, charts…)
│   ├── lib/
│   │   ├── server/                   # Server-only: prisma, auth, payu, ai,
│   │   │                             #   billing, email, whatsapp, godowns…
│   │   ├── api.ts                    # Browser API client (JWT, x-shop-id)
│   │   ├── businessConfig.ts         # 7 business-type presets
│   │   ├── businessStore.ts          # Multi-shop state (zustand)
│   │   ├── subscriptionAccess.ts     # Access gating when subscription ends
│   │   └── …                         # planGates, pdfExport, smartSearch…
│   ├── prisma/schema.prisma          # Database schema (24 models)
│   ├── i18n/                         # next-intl config
│   ├── messages/                     # en / hi / mr translations
│   └── next.config.ts                # serverExternalPackages (prisma, bcrypt…)
│
├── landing-page/                     # Marketing site (Next.js static export)
│   ├── src/
│   │   ├── app/                      # home, about, blog, contact, legal,
│   │   │                             #   login, register, payment, success…
│   │   ├── components/               # Navbar, Pricing, Hero, FAQ, Footer…
│   │   └── lib/config.ts             # Runtime API/app URL resolution
│   └── next.config.ts                # output: "export"  →  builds to out/
│
├── supabase/                         # SQL schema + RLS + storage + migrations
│   ├── 01_schema.sql … 08_godowns_and_multishop.sql
│
├── .env.example                      # Environment variable template
├── render.yaml                       # Render blueprint
├── SUBSCRIPTIONS.md                  # Subscription / trial / billing flow docs
└── README.md
```

## Features

### For Shop Owners
- **Smart Billing** — GST-ready invoices with auto-calculation, discounts, partial payments, PDF bills + WhatsApp sharing
- **Inventory Management** — Stock in/out, low-stock alerts, expiry tracking, barcode/QR support
- **Udhar Book** — Digital credit ledger with WhatsApp/PDF payment reminders
- **Multi-Shop & Godowns** — Run multiple shops and warehouses, transfer stock between godowns
- **Dukandar (Retailer) Management** — Wholesalers track credit given to retailers, send stock alerts, handle quotations
- **AI Assistant & Insights** — Chat assistant, sales analytics, demand & pricing hints (OpenRouter / Gemini)
- **Reports** — Daily/monthly sales, profit analysis, top products, trends, Excel export
- **Calendar & Reminders** — Schedule follow-ups and payment reminders
- **Bulk Import** — Import products from Excel/CSV
- **Returns Management** — Handle returns and exchanges
- **Referral Program** — Earn rewards (and longer trials) by referring other shops
- **Multi-language** — English, Hindi, Marathi
- **7 Business Types** — Kirana, Medical, Cosmetics, Shoes, Clothes, Electronics, General — each with tailored fields

### For Admin
- **Dashboard** — Platform analytics: revenue, user growth, plan distribution
- **User Management** — Search, filter, block/activate/delete users
- **Subscription Control** — Change plans, run subscription actions, view payment history
- **Broadcast Notifications** — Push announcements to all users
- **Referral Oversight** — View all referral relationships

## Subscriptions & Pricing

New users get a **free trial automatically at signup** — no card required. After the trial they renew manually via PayU (with reminders before expiry; no silent auto-charges). See [SUBSCRIPTIONS.md](SUBSCRIPTIONS.md) for the full flow.

| Plan | Key | Price | For |
|------|-----|-------|-----|
| **Dukaan** | `shop` | ₹299/mo | Small kirana, grocery & retail stores |
| **Vyapar** | `vyapar` | ₹499/mo | Growing shops with multiple branches |
| **Udyog** | `wholesale` | ₹999/mo | Wholesalers, distributors & large businesses |

- **Free trial:** 7 days standard, **14 days** if signed up with a referral code
- **Plan switching is free during an active trial** (keeps remaining days); after the trial, switching requires payment
- **30-day money-back guarantee** on the first paid charge
- Subscription statuses: `trial` → `active` → `expired` / `cancelled`. When ended, access is gated to core read-only pages (see [app/lib/subscriptionAccess.ts](app/lib/subscriptionAccess.ts))

## Tech Stack

| Layer | Technology |
|-------|-----------|
| App (UI + API) | Next.js 15 (App Router + Route Handlers), React 19, TypeScript |
| Landing Page | Next.js 15 (static export), Tailwind CSS, Framer Motion, three.js |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma 6 |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Payments | PayU India (one-time, hash-verified) |
| AI | OpenRouter (default) / Google Gemini |
| Email | Nodemailer (SMTP) |
| State | Zustand |
| Internationalization | next-intl (en, hi, mr) |
| Docs / PDF | jsPDF, html2canvas-pro, xlsx |

## Data Model (Prisma)

Core models in [app/prisma/schema.prisma](app/prisma/schema.prisma):

`User`, `Shop`, `PaymentTransaction`, `Product`, `Customer`, `Sale`, `SaleItem`,
`StockLog`, `Godown`, `GodownProduct`, `customer_transactions`, `CalendarEvent`,
`ReferralCode`, `Referral`, `DukandarRelationship`, `DukandarStockAlert`,
`DukandarCredit`, `SupportTicket`, `ToolUsage`, `PushSubscription`,
`NotificationSetting`, `UserNotification`, `AdminNotification`, `AdminUser`.

## Environment Variables

Full template is in [.env.example](.env.example). Key variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `SECRET_KEY` | JWT signing secret | ✅ |
| `ADMIN_SECRET_KEY` | Key required to register an admin account | ✅ |
| `NEXT_PUBLIC_API_URL` | API base URL for the browser (e.g. `https://app.example.com/api/v1`) | ✅ |
| `NEXT_PUBLIC_FRONTEND_URL` | App (dashboard) public URL | ✅ |
| `NEXT_PUBLIC_LANDING_URL` | Landing page public URL | ✅ |
| `FRONTEND_URL` / `APP_URL` / `LANDING_URL` | Server-side URLs for CORS, links, emails | ✅ |
| `OPENROUTER_API_KEY` | Powers the AI assistant — [openrouter.ai/keys](https://openrouter.ai/keys) | optional |
| `OPENROUTER_MODEL` | Model id (default: `nvidia/nemotron-3-nano-30b-a3b:free`) | optional |
| `GEMINI_API_KEY` | Alternative AI provider (Google Gemini) | optional |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Email (password reset, support) | optional |
| `SUPPORT_EMAIL` | Support inbox address | optional |
| `PAYU_KEY` / `PAYU_SALT` | PayU merchant credentials for subscriptions | optional |
| `CRON_SECRET` | Bearer secret guarding `/api/v1/cron/process-subscriptions` | optional |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase storage (image uploads) | optional |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client id | optional |

> ⚠️ `NEXT_PUBLIC_*` values are **baked into the browser bundle at build time** — set them before `npm run build`, and rebuild after any change.

## Local Development

### Prerequisites
- Node.js 20+
- A PostgreSQL database (Supabase, or local Postgres)
- npm

### Setup

```bash
# 1. Clone
git clone https://github.com/RGGlobalServices/Vyapar-Sarthi.git
cd Vyapar-Sarthi

# 2. Create the env file used by the app in dev (read from repo root)
cp .env.example .env.local
#    → edit .env.local: set DATABASE_URL, SECRET_KEY, and the URLs.
#    For pure local dev you can use:
#      NEXT_PUBLIC_API_URL="/api/v1"
#      NEXT_PUBLIC_FRONTEND_URL="http://localhost:3000"
#      NEXT_PUBLIC_LANDING_URL="http://localhost:3001"

# 3. App (UI + API)  ── terminal 1
cd app
npm install              # also runs `prisma generate`
npx prisma db push       # create tables
cd ..
npm run dev              # from repo root → app on http://localhost:3000

# 4. Landing page  ── terminal 2
cd landing-page
npm install
npm run dev              # → http://localhost:3001
```

> The root `package.json` scripts (`dev`, `build`, `start`) delegate to `app/`.
> The app's dev server reads env from the repo-root `.env.local` (via dotenv-cli).
> The landing page reads its own `landing-page/.env.local` (or env passed at build).

### Access
- Dashboard app: `http://localhost:3000`
- API: `http://localhost:3000/api/v1/...`
- Landing page: `http://localhost:3001`
- Admin panel: `http://localhost:3000/en/admin/login`

### Useful scripts (in `app/`)
```bash
npm run dev          # dev server on port 3000
npm run build        # production build
npm start            # start production build
npm run db:push      # prisma db push
npm run db:generate  # prisma generate
npm run db:migrate   # prisma migrate dev
npm run lint         # eslint
```

## Deployment

> A reference file `.env.production` template lives in the repo (gitignored on real machines).
> Replace `yourdomain.com` / `app.yourdomain.com` with your real domains.

> **You only deploy two things:**
> 1. **`app/`** — a long-lived Node process (`next start`, port 3000) serving the dashboard **and** the API (`/api/v1/*`). Needs PostgreSQL.
> 2. **`landing-page/`** — `npm run build` produces a static `out/` folder that any web server (Nginx, S3, a static host) serves directly — no Node process needed.

### Option 1: Deploy on Hostinger VPS (Recommended)

This is a full self-hosted setup on a Hostinger **VPS** (KVM plan) running Ubuntu, using **Nginx** as a reverse proxy + static file server, **PM2** to keep the app alive, and **Let's Encrypt** for free HTTPS.

> ⚠️ You need a **VPS** plan (KVM 1 or higher), **not** shared/web hosting — shared hosting cannot run a Node.js server. In hPanel this is under **VPS**, not **Hosting**.

#### What you'll set up

| Domain | Serves | How |
|--------|--------|-----|
| `yourdomain.com` | Landing page (marketing/pricing) | Nginx serves static `landing-page/out` |
| `app.yourdomain.com` | Dashboard **+ API** (`/api/v1/*`) | Nginx reverse-proxies to Node on `127.0.0.1:3000` |

Database: either keep using **Supabase** (managed Postgres — nothing to install) or install **PostgreSQL on the VPS**. Both are covered below.

---

#### Step 1 — Create the VPS & point your domain

1. In Hostinger hPanel → **VPS** → buy a KVM plan → choose **Ubuntu 24.04** (or 22.04) as the OS template.
2. Note the VPS **public IP** and the **root password** (or add your SSH key).
3. In your DNS (Hostinger → **Domains → DNS / Nameservers**), add two **A records** pointing to the VPS IP:
   - `@`   → `YOUR_VPS_IP`   (this is `yourdomain.com`)
   - `app` → `YOUR_VPS_IP`   (this is `app.yourdomain.com`)
4. Wait for DNS to propagate (usually minutes, up to a few hours).

---

#### Step 2 — Connect and harden the server

From your computer:

```bash
ssh root@YOUR_VPS_IP
```

Then on the server:

```bash
# Update everything
apt update && apt upgrade -y

# Create a non-root user (run the app as this user, not root)
adduser deploy
usermod -aG sudo deploy

# Basic firewall: allow SSH + HTTP + HTTPS only
apt install -y ufw
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Switch to the deploy user for everything below
su - deploy
```

---

#### Step 3 — Install Node.js 20, Git, Nginx, PM2

```bash
# Node.js 20 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# PM2 process manager (keeps the app running + restarts on reboot)
sudo npm install -g pm2

# Verify
node -v    # v20.x
npm -v
```

---

#### Step 4 — (Option A) Use Supabase  OR  (Option B) Install PostgreSQL locally

**Option A — Supabase (easiest):** skip installing a database. Just use your existing Supabase `DATABASE_URL` (the pooled connection string, port `6543`) in the env file below.

**Option B — PostgreSQL on the VPS:**

```bash
sudo apt install -y postgresql
sudo -u postgres psql <<'SQL'
CREATE DATABASE vyapar;
CREATE USER vyapar_user WITH ENCRYPTED PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE vyapar TO vyapar_user;
ALTER DATABASE vyapar OWNER TO vyapar_user;
SQL
```

Your `DATABASE_URL` then becomes:
`postgresql://vyapar_user:CHANGE_ME_STRONG_PASSWORD@localhost:5432/vyapar`

---

#### Step 5 — Clone the repository

```bash
cd ~
git clone https://github.com/RGGlobalServices/Vyapar-Sarthi.git
cd Vyapar-Sarthi
```

> The repo does **not** contain any `.env` secrets (they're gitignored). You create them on the server in the next step.

---

#### Step 6 — Configure environment variables

`NEXT_PUBLIC_*` values are **baked in at build time**, so the env files must exist **before** you build.

**6a. App env** — create `app/.env.production`:

```bash
nano app/.env.production
```

```env
# --- Database ---
DATABASE_URL="postgresql://vyapar_user:PASSWORD@localhost:5432/vyapar"

# --- Auth ---
SECRET_KEY="generate-a-long-random-string"
ADMIN_SECRET_KEY="another-random-string"

# --- Public URLs (baked into the browser bundle) ---
NEXT_PUBLIC_API_URL="https://app.yourdomain.com/api/v1"
NEXT_PUBLIC_FRONTEND_URL="https://app.yourdomain.com"
NEXT_PUBLIC_LANDING_URL="https://yourdomain.com"

# --- Server-side URLs (used for CORS / links / emails) ---
FRONTEND_URL="https://app.yourdomain.com"
APP_URL="https://app.yourdomain.com"
LANDING_URL="https://yourdomain.com"

# --- AI assistant (OpenRouter) ---
OPENROUTER_API_KEY=""
OPENROUTER_MODEL="nvidia/nemotron-3-nano-30b-a3b:free"

# --- SMTP (password reset / support email) ---
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER=""
SMTP_PASSWORD=""
SUPPORT_EMAIL=""

# --- PayU (subscriptions) ---
PAYU_KEY=""
PAYU_SALT=""

# --- Subscription cron guard (see Step 11) ---
CRON_SECRET="generate-a-long-random-string"

# --- Supabase storage (optional, for image uploads) ---
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
```

Generate strong random secrets with: `openssl rand -hex 32`

**6b. Landing-page env** — create `landing-page/.env.production`:

```bash
nano landing-page/.env.production
```

```env
NEXT_PUBLIC_API_URL="https://app.yourdomain.com/api/v1"
NEXT_PUBLIC_FRONTEND_URL="https://app.yourdomain.com"
NEXT_PUBLIC_LANDING_URL="https://yourdomain.com"
NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
```

---

#### Step 7 — Build both apps & push the database schema

```bash
# --- App (dashboard + API) ---
cd ~/Vyapar-Sarthi/app
npm install                 # also runs `prisma generate` (postinstall)
npx prisma db push          # creates all tables in your database
npm run build               # production build of the Next.js server

# --- Landing page (static export) ---
cd ~/Vyapar-Sarthi/landing-page
npm install
npm run build               # outputs static files to landing-page/out
```

> If `npm run build` is killed on a small VPS (out of memory), add swap:
> `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

---

#### Step 8 — Start the app with PM2

```bash
cd ~/Vyapar-Sarthi/app
pm2 start npm --name vyapar-app -- start    # runs `next start` on port 3000

# Keep it running after reboot
pm2 save
pm2 startup            # run the command it prints (sets up a systemd service)
```

Check it's up: `pm2 status` and `curl http://localhost:3000` should return HTML.

---

#### Step 9 — Configure Nginx (reverse proxy + static site)

Create the site config:

```bash
sudo nano /etc/nginx/sites-available/vyapar
```

```nginx
# --- App + API: app.yourdomain.com -> Node on port 3000 ---
server {
    listen 80;
    server_name app.yourdomain.com;

    client_max_body_size 20M;   # allow image/Excel uploads

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# --- Landing page: yourdomain.com -> static files ---
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /home/deploy/Vyapar-Sarthi/landing-page/out;
    index index.html;

    location / {
        try_files $uri $uri.html $uri/ /index.html;
    }
}
```

Enable it and reload:

```bash
sudo ln -s /etc/nginx/sites-available/vyapar /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t          # test config
sudo systemctl reload nginx
```

> Nginx needs execute permission on the home dir to read the static files:
> `chmod o+x /home/deploy`

---

#### Step 10 — Enable HTTPS (free SSL)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d app.yourdomain.com
```

Certbot edits the Nginx config to add SSL and sets up auto-renewal. Choose "redirect HTTP → HTTPS" when asked.

---

#### Step 11 — Schedule the subscription cron

The app exposes `GET /api/v1/cron/process-subscriptions` (sends renewal reminders + expires lapsed subscriptions), protected by `CRON_SECRET`. Run it once a day with the server's crontab:

```bash
crontab -e
```

Add (runs daily at 2 AM):

```cron
0 2 * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" https://app.yourdomain.com/api/v1/cron/process-subscriptions > /dev/null 2>&1
```

---

#### Step 12 — Create the first admin account

```bash
curl -X POST https://app.yourdomain.com/api/v1/admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Admin",
    "email": "admin@yourdomain.com",
    "password": "a-strong-password",
    "secretKey": "YOUR_ADMIN_SECRET_KEY"
  }'
```

Then log in at `https://app.yourdomain.com/en/admin/login`.

---

#### Updating after you push new code

```bash
cd ~/Vyapar-Sarthi
git pull origin main

# Rebuild whichever app changed:
cd app && npm install && npx prisma db push && npm run build && pm2 restart vyapar-app
cd ../landing-page && npm install && npm run build   # static — Nginx serves new files instantly
```

#### Quick troubleshooting

| Symptom | Fix |
|---------|-----|
| `502 Bad Gateway` on app domain | App isn't running — `pm2 status`, `pm2 logs vyapar-app` |
| Landing shows 403 / blank | Nginx can't read `out/` — run `chmod o+x /home/deploy` |
| Build gets "Killed" | Out of RAM — add swap (see Step 7 note) |
| API calls blocked by CORS | Check `FRONTEND_URL` / `LANDING_URL` match your real domains, then `pm2 restart vyapar-app` |
| `NEXT_PUBLIC_*` change not taking effect | These are baked at build — you must **rebuild** after changing them |
| DB connection errors | Verify `DATABASE_URL`; for Supabase use the **pooled** string (port 6543) |
| `No prebuild or local build of @parcel/watcher found` / `Failed to load next.config.ts` | The committed `package-lock.json` was generated on Windows, so npm skips the **Linux** native binary. Fix per app: `rm -rf node_modules package-lock.json && npm install && npm run build`. Ensure nothing omits optional deps (`npm config get optional` must not be `false`; install command must not use `--omit=optional` / `--no-optional`). |

---

### Option 2: Deploy on Render

Two services on Render:

**Service 1 — App (Web Service)**
| Setting | Value |
|---------|-------|
| Type | Web Service |
| Root Directory | `app` |
| Build Command | `npm install && npx prisma generate && npm run build` |
| Start Command | `npm start` |
| Health Check | `/` |

Add a Render PostgreSQL instance and set `DATABASE_URL`, `SECRET_KEY`, `ADMIN_SECRET_KEY`, the `NEXT_PUBLIC_*` URLs, and any optional keys (PayU, OpenRouter, SMTP, `CRON_SECRET`). Run `npx prisma db push` once (Render Shell) to create tables. Use **Render Cron Jobs** to hit `/api/v1/cron/process-subscriptions` daily with the `CRON_SECRET` bearer header.

**Service 2 — Landing page (Static Site)**
| Setting | Value |
|---------|-------|
| Type | Static Site |
| Root Directory | `landing-page` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `out` |

Set the landing site's `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_FRONTEND_URL` / `NEXT_PUBLIC_LANDING_URL` to the deployed URLs.

### Option 3: Any Node host / Docker

The app is a standard Next.js server, so it runs on any Node 20 host (Railway, Fly.io, a bare VM, or Docker). Build with `npm run build`, run with `npm start` (port 3000), point a reverse proxy at it, and serve `landing-page/out` as static files. A `Dockerfile` is included in the repo root for containerized deploys.

### Database setup (all platforms)
```bash
cd app
npx prisma db push        # create/update tables from schema
# Optional one-off SQL (RLS, storage policies, seed migrations) is in supabase/*.sql
```

## API Reference

All endpoints are under `/api/v1`. Auth uses a JWT `Authorization: Bearer <token>` header; multi-shop requests include an `x-shop-id` header (handled automatically by the client).

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register a user (auto-starts free trial) |
| POST | `/auth/login` | Login → JWT |
| POST | `/auth/verify-otp` | Verify OTP |
| POST | `/auth/forgot-password` | Send reset email |
| POST | `/auth/reset-password` | Reset password |

### Shop
| Method | Path | Description |
|--------|------|-------------|
| GET / PATCH | `/shop/profile` | Get / update active shop |
| POST | `/shop/create` | Create a new shop (name, type, address, contact) |
| GET | `/shop/my-shops` | List the user's shops |
| POST | `/shop/switch-plan` | Free plan switch during active trial |
| GET | `/shop/today-profit` | Today's profit |

### Products & Stock
| Method | Path | Description |
|--------|------|-------------|
| GET / POST | `/products` | List / create products |
| GET / PATCH / DELETE | `/products/[productId]` | Product detail |
| POST | `/products/[productId]/adjust` | Stock in/out adjustment |
| GET | `/products/logs/all` | Stock adjustment history |

### Billing & Customers
| Method | Path | Description |
|--------|------|-------------|
| GET / POST | `/billing` | List / create invoices |
| GET | `/billing/[identifier]` | Invoice by id or number |
| POST | `/billing/returns` | Process a return |
| POST | `/billing/send-bill` | Send bill (PDF / WhatsApp / email) |
| GET / POST | `/customers` | List / create customers |
| GET/PATCH/DELETE | `/customers/[id]` | Customer detail |
| GET / POST | `/customers/[id]/transactions` | Udhar transactions |

### Godowns (warehouses)
| Method | Path | Description |
|--------|------|-------------|
| GET / POST | `/godowns` | List / create godowns |
| GET/PATCH/DELETE | `/godowns/[id]` | Godown detail |
| GET / POST | `/godowns/[id]/inventory` | Godown inventory |
| POST | `/godowns/transfer` | Transfer stock between godowns |

### Dukandar (retailer relationships)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/dukandar/add-dukandar` / `add-dukandar-by-code` | Link a retailer |
| GET | `/dukandar/my-dukandar` / `my-access-code` | Retailers / access code |
| POST/GET | `/dukandar/credit/*` | Credit add / list / pay / summary / dues |
| POST/GET | `/dukandar/send-stock-alert`, `my-alerts`, `respond-alert`, `quotation/[alertId]` | Stock alerts & quotations |

### Reports & AI
| Method | Path | Description |
|--------|------|-------------|
| GET | `/reports/summary` | Sales summary |
| GET | `/reports/sales-trend` | Trend over time |
| GET | `/reports/top-products` | Best sellers |
| GET | `/reports/low-stock` | Low-stock list |
| GET | `/reports/business-report` / `export` | Full report / Excel export |
| POST | `/ai/chat` | AI assistant chat |
| GET | `/ai/insights` | AI-generated insights |

### Payments & Subscriptions
| Method | Path | Description |
|--------|------|-------------|
| POST | `/payments/create-order` | Create PayU one-time order |
| POST | `/payments/payu-success` / `payu-failure` | PayU callbacks (hash-verified) |
| POST | `/payments/cancel-subscription` | Cancel (refund if within money-back window) |
| POST | `/payments/refund` | Issue a refund |
| GET | `/cron/process-subscriptions` | Reminders + expiry (CRON_SECRET protected) |

### Referrals, Notifications, Support
| Method | Path | Description |
|--------|------|-------------|
| GET | `/referrals/my-code`, `my-team`, `my-referrer` | Referral data |
| POST | `/referrals/apply` | Apply a referral code (extends trial) |
| GET/POST | `/notifications/in-app`, `subscribe`, `settings` | Notifications |
| GET/POST | `/support/tickets`, `/support/contact` | Support tickets |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/login`, `/admin/register` | Admin auth (register needs `adminKey`) |
| GET | `/admin/analytics` | Platform analytics |
| GET | `/admin/users`, `/admin/users/[userId]` | Users list / detail |
| PATCH | `/admin/users/[userId]/plan`, `/status`, `/subscription-action` | Manage a user |
| POST | `/admin/broadcast-notification` | Broadcast to all users |
| GET | `/admin/referrals` | All referrals |

## Use Cases

1. **Kirana / Grocery Stores** — Replace manual billing and udhar books with digital management
2. **Medical / Pharmacy** — Track expiry dates, batch stock, and low-stock alerts
3. **Cosmetics / Footwear / Apparel** — Size/variant grids and category-specific fields
4. **Electronics** — EMI billing and high-value inventory tracking
5. **Wholesale / Distribution** — Multi-godown stock, retailer (dukandar) credit, stock alerts
6. **Multi-location Businesses** — Run several shops and warehouses from one account

---

See [SUBSCRIPTIONS.md](SUBSCRIPTIONS.md) for the detailed subscription, trial, and billing flow.
