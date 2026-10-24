FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS multiplayer
WORKDIR /app
ENV PORT=6020 API_PORT=6120 INTERNAL_BIND=0.0.0.0
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY conf ./conf
COPY server ./server
COPY app/world.ts app/rowing.ts app/race-v2.ts ./app/
COPY scripts/multiplayer.mjs ./scripts/multiplayer.mjs
USER node
EXPOSE 6020
HEALTHCHECK --interval=15s --timeout=3s CMD node -e "fetch('http://localhost:6020/health-check').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/multiplayer.mjs"]

FROM caddy:2-alpine AS web
COPY --from=build /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
