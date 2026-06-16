FROM node:20-alpine AS base
WORKDIR /srv

# ── Install dependencies (postinstall runs `prisma generate`) ──
FROM base AS deps
COPY app/package*.json ./app/
COPY app/prisma ./app/prisma
RUN cd app && npm ci

# ── Build ──
FROM base AS build
COPY --from=deps /srv/app/node_modules ./app/node_modules
COPY app/ ./app/
RUN cd app && npx prisma generate && npm run build

# ── Runtime ──
FROM node:20-alpine AS runtime
WORKDIR /srv

# Built Next.js app (which now also serves the API under /api/v1)
COPY --from=build /srv/app/.next ./app/.next
COPY --from=build /srv/app/node_modules ./app/node_modules
COPY --from=build /srv/app/package*.json ./app/
COPY --from=build /srv/app/public ./app/public
COPY --from=build /srv/app/next.config.ts ./app/
COPY --from=build /srv/app/i18n ./app/i18n
COPY --from=build /srv/app/messages ./app/messages
COPY --from=build /srv/app/middleware.ts ./app/
COPY --from=build /srv/app/instrumentation.ts ./app/
COPY --from=build /srv/app/prisma ./app/prisma

EXPOSE 3000
WORKDIR /srv/app
CMD ["npm", "start"]
