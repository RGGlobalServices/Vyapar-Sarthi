# Deployment — Vyapar Sarthii ERP & POS

**Never write secrets in this file.**

---

## Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Local dev | Feature development | `http://localhost:3001` |
| Production | Live app for customers | Hostinger shared hosting |
| Supabase (prod) | PostgreSQL + Storage | `aws-1-ap-southeast-2.pooler.supabase.com` |

---

## Environment Variables (`.env.local`)

All secrets live in `.env.local` — never commit this file.

Required variables:
```
DATABASE_URL        # Supabase transaction pooler (port 6543) — runtime queries
DIRECT_URL          # Supabase direct (port 5432) — migrations only
SUPABASE_URL        # Supabase project URL
SUPABASE_ANON_KEY   # Supabase public anon key
SUPABASE_SERVICE_ROLE_KEY  # Server-only — never expose as NEXT_PUBLIC_*
SECRET_KEY          # JWT signing secret — must be strong and unique in production
NEXT_PUBLIC_API_URL # Public base URL for API calls (client-visible)
```

Optional:
```
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS   # Email (OTP, password reset)
PAYU_KEY / PAYU_SALT                             # PayU payment gateway
```

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server (port 3001)
npm run dev

# In a separate terminal, check for issues
npm run lint
npx tsc --noEmit
npm run test:unit
```

---

## Schema Changes

### Development (no migration file needed)
```bash
# Edit prisma/schema.prisma
npm run db:push        # pushes schema directly + regenerates Prisma client
```

If the dev server is running, the Prisma DLL is locked — use:
```bash
npm run db:push -- --skip-generate
# Then after stopping the server:
npm run db:generate
```

### Production (versioned migration)
```bash
# Edit prisma/schema.prisma
npm run db:migrate     # creates migration file in prisma/migrations/ + applies it
# Commit schema.prisma AND the migration file together
```

**Migration sequence for production:**
1. Apply migration BEFORE deploying new code (schema must be a superset of what old code needs).
2. Deploy new code.
3. Verify health check.

Safe migrations: adding nullable columns, adding indexes, adding new tables.  
Dangerous: removing columns, renaming columns — always check all query sites first.

---

## Production Build

```bash
npm run build
```

This runs Next.js compilation + type check. Must complete with zero errors before any deploy.

### Hostinger-specific notes

- Worker threads are disabled (`next.config.js`) — required for shared hosting.
- Node.js version: check Hostinger dashboard for the supported version.
- Static files are served from `public/` — no CDN needed for small assets.

---

## Deploy Steps

1. `npm run test:unit` → all pass
2. `npx tsc --noEmit` → zero errors
3. `npm run build` → success
4. If schema changed: run `npm run db:migrate` on production DB **first**
5. Upload built files to Hostinger (FTP / Git deploy)
6. Restart Node process (Hostinger control panel or `pm2 restart`)
7. Verify login + dashboard loads in browser
8. Verify a sample sale can be created

---

## Storage (Supabase)

- Bucket: `invoices` — PDF invoices, upload attachments.
- Set bucket to **private** — access via signed URLs (generated server-side using `SUPABASE_SERVICE_ROLE_KEY`).
- Never expose `SUPABASE_SERVICE_ROLE_KEY` client-side.

---

## Mobile (Capacitor)

```bash
npx cap sync android    # Sync web build → Android project
npx cap open android    # Open in Android Studio
# Build APK from Android Studio
```

The app points to the production API URL set in `NEXT_PUBLIC_API_URL`.

---

## Desktop (Electron)

```bash
npm run electron:dev    # Dev mode with Electron
npm run electron:build  # Build distributable (Windows exe / Mac dmg)
```

---

## Health Check

After deploy, verify:
- `GET /api/v1/auth/ping` → `{ ok: true }`
- Login flow works end-to-end
- Dashboard loads without 5xx errors
- Check server logs for any DB connection errors (sign of pooler misconfiguration)

---

## Rollback

1. Re-deploy the previous build artifact.
2. If a migration was applied and the rollback code is incompatible: write a compensating migration (do NOT run `prisma db push` to undo — it may drop data).
3. Notify affected shops if data was impacted.

---

## Backups

Supabase provides daily automatic backups on paid plans. Before any destructive migration:
- Take a manual Supabase DB snapshot from the dashboard.
- Export critical tables to CSV as an extra precaution.
