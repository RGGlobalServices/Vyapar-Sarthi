# Vyapar Sarthi

A comprehensive shop management platform for Kirana (small retail) stores in India. Provides billing, inventory tracking, credit (Udhar) management, AI-powered insights, and multi-language support.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Vyapar Sarthi Platform                        │
├─────────────────┬──────────────────────┬────────────────────────────┤
│   Landing Page  │    Frontend App      │      Backend (Node.js)     │
│   (Next.js SSG) │   (Next.js SSR)      │      (Express + Prisma)    │
│   Port 3001     │   Port 3000          │      Port 10000            │
│                 │                      │                            │
│   Marketing /   │   Shop Management    │   REST API                 │
│   Blog /        │   Admin Panel        │   PostgreSQL DB            │
│   Pricing       │   Dashboard          │   Auth (JWT)               │
│   Documentation │   Billing UI         │   PayU Payments            │
└─────────────────┴──────────────────────┴────────────────────────────┘
```

## Project Structure

```
├── frontend/                    # Main Next.js app (shop management UI)
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── (auth)/          # Login, Signup, Forgot/Reset password
│   │   │   ├── (main)/          # Authenticated routes
│   │   │   │   ├── billing/     # Invoice creation, listing, detail
│   │   │   │   ├── dukandar/    # Customer management (Udhar book)
│   │   │   │   ├── products/    # Product CRUD, stock in/out
│   │   │   │   ├── stock/       # Stock logs
│   │   │   │   ├── reports/     # Sales reports & analytics
│   │   │   │   ├── settings/    # Shop profile, subscription
│   │   │   │   ├── referral/    # Referral program
│   │   │   │   ├── returns/     # Return management
│   │   │   │   ├── import/      # Bulk product import
│   │   │   │   ├── profile/     # User profile
│   │   │   │   ├── udhar/       # Credit/debt tracking
│   │   │   │   └── support/     # Help & support
│   │   │   └── admin/           # Admin panel
│   │   │       ├── login/       # Admin login
│   │   │       ├── page.tsx     # Dashboard
│   │   │       └── users/       # User management
│   │   ├── not-found.tsx        # Custom 404 page
│   │   └── globals.css
│   ├── components/              # Shared UI components
│   ├── lib/                     # API client, config, stores
│   ├── i18n/                    # Internationalization (en/hi/mr)
│   └── middleware.ts            # Auth routing, admin route handling
│
├── landing-page/                # Next.js static site (marketing)
│   ├── src/
│   │   ├── app/
│   │   │   ├── blog/           # Blog with [slug] detail pages
│   │   │   ├── about/
│   │   │   ├── contact/        # Contact form + FAQ
│   │   │   ├── download/
│   │   │   ├── payment/
│   │   │   ├── success/
│   │   │   └── legal/          # Terms, Privacy, Refund
│   │   ├── components/
│   │   │   ├── Navbar.tsx       # Header with auth-aware nav
│   │   │   ├── Footer.tsx       # Footer with links
│   │   │   ├── HeroSection.tsx  # Video background hero
│   │   │   ├── Features.tsx     # Feature cards with SVGs
│   │   │   ├── Pricing.tsx      # Plan comparison
│   │   │   ├── HowItWorks.tsx   # Step-by-step guide
│   │   │   ├── FinalCTA.tsx     # Call-to-action section
│   │   │   └── FAQ.tsx          # FAQ accordion
│   │   └── lib/config.ts       # Environment config
│   └── next.config.ts          # Static export config
│
├── backend-node/                # Node.js + Express API
│   ├── src/
│   │   ├── index.js            # Server entry, middleware, routes
│   │   ├── config.js           # Environment config, CORS, PayU
│   │   ├── db.js               # Prisma client
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT authentication middleware
│   │   ├── routes/
│   │   │   ├── auth.js         # Register, login, forgot/reset password
│   │   │   ├── shop.js         # Shop profile CRUD
│   │   │   ├── products.js     # Product CRUD, stock adjustments
│   │   │   ├── billing.js      # Invoice CRUD, returns
│   │   │   ├── customers.js    # Customer management
│   │   │   ├── dukandar.js     # Udhar book (credit/debt)
│   │   │   ├── reports.js      # Sales reports & analytics
│   │   │   ├── payments.js     # PayU payment integration
│   │   │   ├── referrals.js    # Referral system
│   │   │   ├── notifications.js # Notification management
│   │   │   ├── support.js      # Support ticket system
│   │   │   └── admin.js        # Admin analytics, user mgmt
│   │   └── utils/
│   │       ├── email.js        # Email sending (SMTP)
│   │       └── helpers.js      # Utility functions
│   ├── prisma/
│   │   └── schema.prisma       # Database schema
│   └── Dockerfile               # Production Docker image
│
├── .env.example                 # Environment variable template
├── render.yaml                  # Render deployment config
└── README.md
```

## Features

### For Shop Owners
- **Smart Billing** — Create GST-compliant invoices with auto-calculation, discounts, and partial payments
- **Inventory Management** — Track stock levels, get low-stock alerts, manage stock in/out
- **Udhar Book** — Digital credit management with WhatsApp payment reminders
- **AI Insights** — Sales analytics, demand prediction, pricing recommendations
- **Customer Management** — Track purchase history, credit, and contact details
- **Reports** — Daily/weekly/monthly sales reports, profit analysis
- **Multi-language** — English, Hindi, Marathi interface
- **Bulk Import** — Import products from Excel/CSV
- **Returns Management** — Handle product returns and exchanges
- **Referral Program** — Earn rewards by referring other shop owners
- **Offline Mode** — Works without internet, syncs when connected

### For Admin
- **Dashboard** — Platform analytics, revenue, user growth, plan distribution
- **User Management** — Search, filter, block/activate/delete users
- **User Detail** — View user info, subscription, products, customers, referrals
- **Subscription Management** — Change user plans, cancel/manage subscriptions

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `SECRET_KEY` | JWT signing secret | Required |
| `PORT` | Backend server port | `10000` |
| `FRONTEND_URL` | Frontend app URL (for CORS) | `http://localhost:3000` |
| `LANDING_URL` | Landing page URL (for CORS) | `http://localhost:3001` |
| `BACKEND_URL` | Backend API URL (for CORS) | `http://localhost:10000` |
| `APP_URL` | Application URL | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | API URL for frontend clients | `http://localhost:10000/api/v1` |
| `NEXT_PUBLIC_FRONTEND_URL` | Frontend URL (public) | `http://localhost:3000` |
| `NEXT_PUBLIC_LANDING_URL` | Landing URL (public) | `http://localhost:3001` |
| `ADMIN_SECRET_KEY` | Admin account registration key | — |
| `GEMINI_API_KEY` | Google Gemini AI API key | — |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID | — |
| `PAYU_KEY` | PayU merchant key | — |
| `PAYU_SALT` | PayU merchant salt | — |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server config | `smtp.gmail.com:587` |
| `SMTP_USER` / `SMTP_PASSWORD` | SMTP credentials | — |
| `SUPPORT_EMAIL` | Support email address | — |

## Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL database
- npm

### Setup

```bash
# 1. Clone and install dependencies
git clone <repo-url>
cd Vyapar-Sarthi

# Backend
cd backend-node
cp .env.example .env
# Edit .env with your DATABASE_URL and other settings
npm install
npx prisma db push
npm run dev          # Starts on port 10000

# Frontend (new terminal)
cd frontend
cp ../.env.example .env.local
# Edit .env.local with your settings
npm install
npm run dev          # Starts on port 3000

# Landing page (new terminal)
cd landing-page
npm install
npm run dev          # Starts on port 3001
```

### Access
- Frontend app: `http://localhost:3000`
- Landing page: `http://localhost:3001`
- Backend API: `http://localhost:10000`
- Admin panel: `http://localhost:3000/en/admin/login`

## Deployment

> A reference file `.env.production` is in the repo root with all the variables you need.
> Replace `YOUR-SERVICE` and `YOUR-LANDING` with your actual URLs after creating the services.

> **Current architecture (after migration):** there are now only **two** deployable parts —
> 1. **`app/`** — a single Next.js server that serves both the dashboard UI **and** the API (`/api/v1/*` native Route Handlers). Runs as a long-lived Node process on **port 3000**. Needs PostgreSQL.
> 2. **`landing-page/`** — a Next.js **static export** (`output: "export"`). `npm run build` produces a plain `out/` folder of HTML/CSS/JS that any web server (Nginx) serves directly — no Node process needed.
>
> The old separate `backend-node` Express server no longer exists.

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

# --- Subscription cron guard (see Step 10) ---
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
curl -X POST https://app.yourdomain.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin",
    "email": "admin@yourdomain.com",
    "password": "a-strong-password",
    "isAdmin": true,
    "adminKey": "YOUR_ADMIN_SECRET_KEY"
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

---

### Option 2: Deploy on Render

You need **2 services** on Render:
1. **Combined Service** — Frontend + Backend together (single Web Service)
2. **Landing Page** — Separate Static Site

---

#### Service 1: Frontend + Backend (Combined)

Both apps run inside a single container. The frontend (Next.js on port 3000) and backend (Express on port 10000) start together. The frontend proxies `/api/v1/*` requests to the backend internally, so from the outside everything appears on one port.

##### Step 1: Create root config files

**`package.json`** (root of your repo):
```json
{
  "name": "vyapar-sarthi",
  "private": true,
  "scripts": {
    "install:all": "cd backend-node && npm install && cd ../frontend && npm install",
    "build": "cd backend-node && npx prisma generate && cd ../frontend && npm run build",
    "start": "node start.js"
  }
}
```

**`start.js`** (root of your repo):
```javascript
const { spawn } = require('child_process');
const path = require('path');

// The frontend (Next.js) should be on the externally-exposed port
// because it handles page routes and proxies /api/v1/* to the backend
const EXPOSED_PORT = process.env.PORT || '3000';

// Start backend internally on port 10000
const backend = spawn('node', ['src/index.js'], {
  cwd: path.join(__dirname, 'backend-node'),
  stdio: 'inherit',
  env: { ...process.env, PORT: '10000' },
});

// Start frontend on the exposed port
const frontend = spawn('npx', ['next', 'start', '-p', EXPOSED_PORT], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  env: { ...process.env, PORT: EXPOSED_PORT },
});

function cleanup() {
  backend.kill();
  frontend.kill();
  process.exit();
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
```

##### Step 2: Deploy on Render

| Setting | Value |
|---------|-------|
| **Type** | Web Service |
| **Repo** | `https://github.com/YOUR_USERNAME/Vyapar-Sarthi` |
| **Branch** | `main` |
| **Runtime** | Node |
| **Build Command** | `npm run install:all && npm run build` |
| **Start Command** | `npm start` |
| **Health Check** | `GET /` |

**Environment Variables** (set all of these):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://...` (your Render PostgreSQL connection string) |
| `SECRET_KEY` | Generate a random secret (Render can auto-generate) |
| `ADMIN_SECRET_KEY` | Your admin registration secret |
| `NODE_ENV` | `production` |
| `PORT` | `3000` (the exposed port, Next.js handles incoming requests) |
| `BACKEND_URL` | `http://localhost:10000` (Next.js server-side rewrite proxies API calls internally) |
| `FRONTEND_URL` | `https://your-service.onrender.com` (for CORS) |
| `APP_URL` | `https://your-service.onrender.com` |
| `LANDING_URL` | `https://your-landing-page.onrender.com` (URL of Service 2) |
| `NEXT_PUBLIC_API_URL` | `https://your-service.onrender.com/api/v1` (browser-side API base URL) |
| `NEXT_PUBLIC_FRONTEND_URL` | `https://your-service.onrender.com` |
| `NEXT_PUBLIC_LANDING_URL` | `https://your-landing-page.onrender.com` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | (optional) Google OAuth client ID |
| `SMTP_HOST` / `SMTP_PORT` | (optional) SMTP config |
| `SMTP_USER` / `SMTP_PASSWORD` | (optional) SMTP credentials |
| `SUPPORT_EMAIL` | (optional) Support email |
| `PAYU_KEY` / `PAYU_SALT` | (optional) PayU payment keys |

> The frontend's `next.config.ts` already rewrites `/api/v1/*` to `BACKEND_URL`, so API calls from the browser automatically route to the Express backend.

---

#### Service 2: Landing Page (Separate Static Site)

Deploy the marketing site separately so it can scale independently.

| Setting | Value |
|---------|-------|
| **Type** | Static Site |
| **Repo** | `https://github.com/YOUR_USERNAME/Vyapar-Sarthi` |
| **Branch** | `main` |
| **Root Directory** | `landing-page` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `out` |

**Environment Variables**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://your-service.onrender.com/api/v1` |
| `NEXT_PUBLIC_FRONTEND_URL` | `https://your-service.onrender.com` |
| `NEXT_PUBLIC_LANDING_URL` | `https://your-landing-page.onrender.com` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | (optional) Same as Service 1 |

---

#### How It Works

```
User Browser
     │
     ├── https://your-service.onrender.com ───► Combined Web Service
     │       │                                       │
     │       │  Request arrives at Next.js (port 3000, externally exposed)
     │       │       │
     │       │       ├── /api/v1/*  ──► Next.js rewrite proxy
     │       │       │                     └──► http://localhost:10000/api/v1/*  (Express backend)
     │       │       │
     │       │       └── /* (pages)  ──► Next.js renders & responds directly
     │       │
     └── https://your-landing-page.onrender.com ──► Static Site
```

- The **Next.js frontend** runs on **port 3000** (the externally-exposed port).
- The **Express backend** runs on **port 10000** internally — not directly accessible from outside.
- When the browser navigates to a page (e.g. `/en/billing`), Next.js renders it directly.
- When the browser calls an API (e.g. `POST /api/v1/products`), it hits the Next.js server, which **rewrites** (server-side proxies) the request to `http://localhost:10000/api/v1/products` — this is configured in `frontend/next.config.ts`.
- The backend's CORS is configured via `FRONTEND_URL` and `LANDING_URL` env vars so both the frontend and landing page can make API calls.
- The landing page is a static site deployed separately — it makes API calls directly to the backend's public URL.

---

#### One-Click Deploy with render.yaml

Alternatively, edit the provided `render.yaml` with your service names and use Render's Blueprint feature:

```yaml
services:
  - type: web
    name: vyapar-sarthi-api
    runtime: node
    repo: https://github.com/YOUR_USERNAME/Vyapar-Sarthi
    branch: main
    buildCommand: npm run install:all && npm run build
    startCommand: npm start
    healthCheckPath: /
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: vyapar-db
          property: connectionString
      - key: SECRET_KEY
        generateValue: true
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
      - key: BACKEND_URL
        value: http://localhost:10000
      - key: FRONTEND_URL
        value: https://vyapar-sarthi-api.onrender.com
      - key: APP_URL
        value: https://vyapar-sarthi-api.onrender.com
      - key: LANDING_URL
        value: https://vyapar-sarthi-landing.onrender.com
      - key: NEXT_PUBLIC_API_URL
        value: https://vyapar-sarthi-api.onrender.com/api/v1
      - key: NEXT_PUBLIC_FRONTEND_URL
        value: https://vyapar-sarthi-api.onrender.com
      - key: NEXT_PUBLIC_LANDING_URL
        value: https://vyapar-sarthi-landing.onrender.com

  - type: web
    name: vyapar-sarthi-landing
    runtime: static
    repo: https://github.com/YOUR_USERNAME/Vyapar-Sarthi
    branch: main
    buildCommand: cd landing-page && npm install && npm run build
    staticPublishPath: landing-page/out
    envVars:
      - key: NEXT_PUBLIC_API_URL
        value: https://vyapar-sarthi-api.onrender.com/api/v1
      - key: NEXT_PUBLIC_FRONTEND_URL
        value: https://vyapar-sarthi-api.onrender.com
      - key: NEXT_PUBLIC_LANDING_URL
        value: https://vyapar-sarthi-landing.onrender.com

databases:
  - name: vyapar-db
    databaseName: vyapar
    plan: free
```

### Option 3: Deploy on AWS

#### Backend (ECS Fargate or EC2)
1. Build the Docker image:
   ```bash
   cd backend-node
   docker build -t vyapar-backend .
   docker tag vyapar-backend <your-ecr-repo>:latest
   docker push <your-ecr-repo>:latest
   ```
2. Deploy to ECS Fargate with the environment variables from above
3. Set up an Application Load Balancer and Route 53 domain

#### Frontend (Elastic Beanstalk or ECS)
1. Create a `Dockerfile` in `frontend/`:
   ```dockerfile
   FROM node:20-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build
   EXPOSE 3000
   CMD ["npm", "start"]
   ```
2. Deploy to Elastic Beanstalk (Node.js platform) or ECS
3. Add a PostgreSQL database (RDS) and set the connection string

#### Landing Page (S3 + CloudFront)
1. Build the static site:
   ```bash
   cd landing-page
   npm install
   NEXT_PUBLIC_API_URL=https://your-api.com/api/v1 \
   NEXT_PUBLIC_FRONTEND_URL=https://your-frontend.com \
   npm run build
   ```
2. Upload `out/` directory to S3 bucket
3. Enable static website hosting on S3
4. Optionally add CloudFront CDN and custom domain

### Database Setup (All Platforms)
```bash
# After deploying the backend, run:
npx prisma db push    # Creates all tables
# Or for production migrations:
npx prisma migrate deploy
```

### Admin Account Setup
```bash
# Register the first admin via API:
curl -X POST https://your-backend.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin",
    "email": "admin@example.com",
    "password": "secure-password",
    "isAdmin": true,
    "adminKey": "<your-admin-secret-key>"
  }'
```

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Register new user or admin |
| POST | `/api/v1/auth/login` | Login, returns JWT token |
| POST | `/api/v1/auth/forgot-password` | Send password reset email |
| POST | `/api/v1/auth/reset-password` | Reset password with token |

### Shop
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/shop/profile` | Get shop profile |
| PATCH | `/api/v1/shop/profile` | Update shop profile |
| DELETE | `/api/v1/shop/profile` | Delete shop |

### Products
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/products` | List products |
| POST | `/api/v1/products` | Create product |
| GET | `/api/v1/products/:id` | Get product detail |
| PATCH | `/api/v1/products/:id` | Update product |
| DELETE | `/api/v1/products/:id` | Delete product |
| POST | `/api/v1/products/stock` | Add stock (in) |
| POST | `/api/v1/products/stock/out` | Remove stock (out) |
| GET | `/api/v1/products/stock/logs` | Stock adjustment history |

### Billing
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/billing` | List invoices |
| POST | `/api/v1/billing` | Create invoice |
| GET | `/api/v1/billing/:identifier` | Get invoice by ID or number |
| DELETE | `/api/v1/billing/:id` | Delete invoice |
| POST | `/api/v1/billing/:id/return` | Process return |

### Customers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/customers` | List customers |
| POST | `/api/v1/customers` | Create customer |
| PATCH | `/api/v1/customers/:id` | Update customer |
| DELETE | `/api/v1/customers/:id` | Delete customer |

### Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/reports/daily` | Daily sales report |
| GET | `/api/v1/reports/monthly` | Monthly sales report |
| GET | `/api/v1/reports/profit` | Profit analysis |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/admin/login` | Admin login |
| GET | `/api/v1/admin/analytics` | Platform analytics |
| GET | `/api/v1/admin/users` | List all users (paginated) |
| GET | `/api/v1/admin/users/:id` | User detail |
| DELETE | `/api/v1/admin/users/:id` | Delete user |
| POST | `/api/v1/admin/users/:id/deactivate` | Block user |
| POST | `/api/v1/admin/users/:id/activate` | Unblock user |
| POST | `/api/v1/admin/users/:id/change-plan` | Change user plan |
| GET | `/api/v1/admin/referrals` | All referrals |

### Payments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/payments/create-order` | Create PayU order |
| POST | `/api/v1/payments/verify` | Verify payment |
| GET | `/api/v1/payments/plans` | List subscription plans |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React, TypeScript, Tailwind CSS |
| Landing Page | Next.js 15 (static export), Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, Prisma ORM |
| Database | PostgreSQL (Supabase) |
| Auth | JWT tokens, bcryptjs |
| Payments | PayU India |
| AI | Google Gemini API |
| Email | Nodemailer (SMTP) |
| Icons | Lucide React |
| Internationalization | next-intl (en, hi, mr) |
| Animation | Framer Motion |

## Use Cases

1. **Kirana / Grocery Stores** — Replace manual billing and udhar books with digital management
2. **General Stores** — Track inventory across hundreds of products with automated low-stock alerts
3. **Mobile Shops / Small Retail** — Manage customer credit, send WhatsApp payment reminders
4. **Wholesale Distributors** — Handle bulk invoices, track payments from multiple retailers
5. **Multi-location Shops** — Manage multiple shops from a single admin panel
