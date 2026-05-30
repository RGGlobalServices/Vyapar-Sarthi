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

### Option 1: Deploy on Render

Render is the recommended platform for easy deployment. You need **3 services**:

#### 1. Backend (Node.js + Docker)
- **Type**: Web Service
- **Runtime**: Docker
- **Build**: Uses `backend-node/Dockerfile`
- **Health Check**: `GET /`
- **Environment Variables** (all required):
  ```
  DATABASE_URL=<your-postgres-connection-string>
  SECRET_KEY=<generate-a-random-secret>
  FRONTEND_URL=https://your-frontend.onrender.com
  LANDING_URL=https://your-landing-page.onrender.com
  BACKEND_URL=https://your-backend.onrender.com
  APP_URL=https://your-frontend.onrender.com
  ADMIN_SECRET_KEY=<your-admin-secret>
  ```
- **Start Command**: `node src/index.js` (already in Dockerfile)

#### 2. Frontend (Next.js SSR)
- **Type**: Web Service
- **Runtime**: Node
- **Build Command**: `cd frontend && npm install && npm run build`
- **Start Command**: `cd frontend && npm start`
- **Environment Variables** (all required):
  ```
  NODE_ENV=production
  NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api/v1
  NEXT_PUBLIC_FRONTEND_URL=https://your-frontend.onrender.com
  NEXT_PUBLIC_LANDING_URL=https://your-landing-page.onrender.com
  BACKEND_URL=https://your-backend.onrender.com
  ```

#### 3. Landing Page (Next.js Static Site)
- **Type**: Static Site
- **Build Command**: `cd landing-page && npm install && npm run build`
- **Publish Directory**: `landing-page/out`
- **Environment Variables**:
  ```
  NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api/v1
  NEXT_PUBLIC_FRONTEND_URL=https://your-frontend.onrender.com
  NEXT_PUBLIC_LANDING_URL=https://your-landing-page.onrender.com
  ```

Or use the provided `render.yaml` (one-click deploy):
```yaml
# Edit render.yaml with your repo URL and service names
# Then connect your GitHub repo to Render and it auto-detects the config
```

### Option 2: Deploy on AWS

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
