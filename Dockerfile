FROM node:20-alpine AS base
WORKDIR /app

# ── Install backend dependencies ──
FROM base AS backend-deps
COPY backend-node/package*.json ./backend-node/
RUN cd backend-node && npm ci

# ── Install frontend dependencies ──
FROM base AS frontend-deps
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

# ── Build ──
FROM base AS build
COPY --from=backend-deps /app/backend-node/node_modules ./backend-node/node_modules
COPY --from=frontend-deps /app/frontend/node_modules ./frontend/node_modules
COPY backend-node/ ./backend-node/
COPY frontend/ ./frontend/
RUN cd backend-node && npx prisma generate
RUN cd frontend && npm run build

# ── Runtime ──
FROM node:20-alpine AS runtime
WORKDIR /app

# Copy Prisma generated client + backend source
COPY --from=build /app/backend-node/node_modules ./backend-node/node_modules
COPY --from=build /app/backend-node/prisma ./backend-node/prisma
COPY --from=build /app/backend-node/src ./backend-node/src
COPY --from=build /app/backend-node/package*.json ./backend-node/

# Copy built frontend
COPY --from=build /app/frontend/.next ./frontend/.next
COPY --from=build /app/frontend/node_modules ./frontend/node_modules
COPY --from=build /app/frontend/package*.json ./frontend/
COPY --from=build /app/frontend/public ./frontend/public
COPY --from=build /app/frontend/next.config.ts ./frontend/
COPY --from=build /app/frontend/i18n ./frontend/i18n
COPY --from=build /app/frontend/middleware.ts ./frontend/

# Copy start script
COPY start.js ./
COPY package.json ./

EXPOSE 3000
CMD ["node", "start.js"]
