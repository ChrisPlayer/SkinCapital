# syntax=docker/dockerfile:1

# ---- Build: client (vite) + server bundle (esbuild) ----
FROM node:22-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && node scripts/gen-runtime-package.mjs /runtime

# ---- Runtime deps: only what the bundle loads from disk ----
# (better-sqlite3 native binary + the Steam stack, see scripts/runtime-externals.json)
FROM node:22-bookworm-slim AS runtime-deps
WORKDIR /runtime
COPY --from=build /runtime/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && rm -f package.json package-lock.json

# ---- Runtime ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    CLIENT_DIST=/app/public \
    OPEN_BROWSER=0
WORKDIR /app
COPY --from=build /build/dist/server/server.cjs ./server.cjs
COPY --from=build /build/dist/client ./public
COPY --from=runtime-deps /runtime/node_modules ./node_modules
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "server.cjs"]
