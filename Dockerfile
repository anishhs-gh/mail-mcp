FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Copy mailts source (local dependency)
COPY ../mailts /mailts
RUN cd /mailts && npm ci && npm run build:core

COPY . .
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Config file is mounted read-only at runtime:
#   docker run -v ./config.json:/config/config.json:ro -e MAIL_MCP_CONFIG=/config/config.json ...
ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
