FROM node:20-alpine AS base
WORKDIR /srv

# ── Install dependencies (postinstall runs `prisma generate`) ──
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --include=optional

# ── Build ──
FROM base AS build
COPY --from=deps /srv/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ── Runtime ──
FROM node:20-alpine AS runtime
WORKDIR /srv

# Built Next.js app (which also serves the API under /api/v1)
COPY --from=build /srv/.next ./.next
COPY --from=build /srv/node_modules ./node_modules
COPY --from=build /srv/package*.json ./
COPY --from=build /srv/public ./public
COPY --from=build /srv/next.config.js ./
COPY --from=build /srv/i18n ./i18n
COPY --from=build /srv/messages ./messages
COPY --from=build /srv/middleware.ts ./
COPY --from=build /srv/instrumentation.ts ./
COPY --from=build /srv/prisma ./prisma

EXPOSE 3000
CMD ["npm", "start"]
