# CS2 Inventory Tracker v2

CS2 inventory tracker with Storage Units support, multi-source pricing (Steam Market / CSFloat / Skinport) and value history.

**Stack**: Express + TypeScript / React + Vite / SQLite (better-sqlite3) / shadcn/ui + Tailwind

## Installation

### Windows

➡️ **[Download the latest release](https://github.com/ChrisPlayer/SkinCapital/releases/latest)** (`SkinCapital-win-x64-v*.zip`)

1. Extract the zip anywhere (right click → *Extract All*)
2. Double-click **SkinCapital.exe**: a window opens with the server logs, then your browser opens on the app automatically
3. To stop: close the window (or Ctrl+C)

Nothing else to install. Your data and your Steam login stay on **your** computer (`data\` folder next to the exe). See the `README.txt` included in the zip.

### Docker

Image published to GitHub Container Registry on every release:

```bash
docker run -d --name skincapital \
  -p 3000:3000 \
  -v skincapital-data:/data \
  ghcr.io/chrisplayer/skincapital:latest
```

Or with the provided [`docker-compose.yml`](docker-compose.yml): `docker compose up -d`. The app listens on `http://localhost:3000`; if you access it through another URL (LAN IP, domain), add it to `ALLOWED_ORIGINS` (anti-CSRF) and put it behind HTTPS before exposing the Steam login beyond the machine.

---

The rest of this document covers the **developer** setup (from sources).

## Requirements

- **Node 22** (the `engines` field enforces `>=22 <23` and a `.nvmrc` file is provided).
  The native module `better-sqlite3` does not compile on Node 24: stay on Node 22.

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env: set a real SESSION_SECRET (see .env.example for the command)

# 3. Dev (hot-reload frontend + backend)
npm run dev

# 4. Open http://localhost:5173
```

In production:

```bash
npm run build        # client (vite) + server bundle (esbuild) into dist/
npm run start:dist   # runs dist/server/server.cjs
# Open http://localhost:3000
```

Without `SESSION_SECRET` in the `.env`, the server generates one on first start and persists it in `data/.session-secret`; setting one explicitly still takes precedence.

## Configuration (.env)

| Variable | Description | Default |
|---|---|---|
| `PORT` | Express server port | `3000` |
| `HOST` | Bind address. Only change to expose on the LAN, and only behind HTTPS | `127.0.0.1` |
| `SESSION_SECRET` | Signs the session cookie and encrypts stored proxies (AES-256-GCM) | auto-generated, persisted in `DATA_DIR` |
| `DATA_DIR` | Data folder (SQLite DB, schema cache, secret) | `./data` |
| `OPEN_BROWSER` | Opens the browser on startup (`1`/`true`): used by the Windows pack | off |
| `ALLOWED_ORIGINS` | Browser origins allowed for CORS + CSRF (add your LAN host/IP) | `http://localhost:5173,...` |
| `REFRESH_INTERVAL` | Inventory auto-refresh (minutes) | `10` |
| `STEAM_PRICING_MODE` | `auto` / `proxy` / `direct`, also configurable from the Settings page | `auto` |
| `STEAM_PROXIES` | Optional paid proxies (`host:port:user:pass` or `http://user:pass@host:port`), also configurable from the UI | - |
| `STEAM_DIRECT_INTERVAL_MS` | Spacing (ms) between Steam requests in direct mode | `3500` |
| `PRICE_CACHE_TTL_HOURS` | How long (hours) a cached price is considered fresh | `20` |
| `SKINPORT_TTL_MS` | TTL (ms) of the Skinport bulk price list cache | `600000` |
| `CSFLOAT_API_KEY` | CSFloat API key (required in practice, otherwise `403`) | - |
| `NODE_ENV` | `development` or `production` | `development` |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Also copies logs to this file (rotated at 5 MB). The Windows pack sets it to `data\server.log` | off |

All fine-tuning variables (workers, timeouts, cooldowns, proxy verification, CSFloat pacing...) are documented in [`.env.example`](.env.example).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev mode (Express + Vite hot-reload) |
| `npm run build` | Production build: client (Vite) + server bundle (esbuild) |
| `npm start` | Server from sources (tsx) |
| `npm run start:dist` | Server from the production bundle |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run package:win` | Windows pack (`SkinCapital.exe`, output in `release/`) |

## Release (maintainers)

Pushing a `v*` tag triggers the [release.yml](.github/workflows/release.yml) workflow:
the Windows zip (Node SEA exe) is built and attached to the GitHub Release with
generated notes, and the multi-arch Docker image is pushed to
`ghcr.io/chrisplayer/skincapital` (tags `latest`, `X.Y.Z`, `X.Y`).

```bash
npm version minor        # bump + tag vX.Y.Z
git push --follow-tags
```

## Features

- **3 price sources**:
  - **Steam Market**: proxy pool (paid residential proxies) or throttled proxy-less direct mode (`STEAM_PRICING_MODE=auto|proxy|direct`)
  - **CSFloat**: via API key
  - **Skinport**: bulk endpoint, no key required
- **One source at a time** in the main view (Steam, Steam net of fees, CSFloat or Skinport); the item detail modal shows all three sources side by side
- **Settings page**: price source, pricing mode (auto/proxy/direct), proxy management and language, straight from the UI, no `.env` editing
- **Storage Units**: reads CS2 caskets through the Game Coordinator, included in the inventory and the dashboard
- **Multi-profile**: track several Steam accounts, selectable from the home page
- **History**: value evolution chart (7/30/90 days)
- **Search & sort**: real-time, by price/name/float
- **CSV export**: download the full inventory
- **i18n**: FR / EN interface
- **Auto-refresh**: configurable cron

## Structure

```
src/
  shared/          Types & constants shared by client + server
  server/
    db/            SQLite schema (auto-init) + queries
    features/
      auth/        Steam login, auth middleware
      steam/       Steam client + inventory + item schema
      inventory/   Refresh, dashboard data, cron jobs
      pricing/     Price sources (Steam proxy/direct, CSFloat, Skinport), queues + cache
      history/     Daily snapshots
      export/      CSV export
      profiles/    Tracked profiles
      settings/    Persisted settings (pricing mode, encrypted proxies)
    middleware/    Session, security (helmet/cors/rate-limit), error handler
    lib/           Crypto, logger
  client/
    features/
      auth/        Login page + Steam Guard
      dashboard/   KPIs, chart, history, storage units
      inventory/   Item cards, detail modal (3 prices), float bar, stickers
      profiles/    Home page, profile selection
      settings/    Price source, pricing mode, proxies, language
    components/ui/ shadcn components
    hooks/         useApi, usePolling
    lib/           API client, i18n, formatters, cn
data/              SQLite DB + item schema cache
```

## Troubleshooting

| Problem | Solution |
|---|---|
| `npm install` fails on better-sqlite3 | Check your Node version: Node 22 required (`nvm use`) |
| Steam Guard prompted | Approve in the Steam mobile app, or enter the 5-digit code |
| GC timeout | The CS2 Game Coordinator can be flaky, the app retries automatically |
| Rate limit 429 | Cooldown is applied per worker/proxy, the other workers keep going |
| CSFloat 401/403 | Check `CSFLOAT_API_KEY` (`raw` or `Bearer <key>`), then restart |
| Empty Storage Units | Check that the caskets actually contain items |
| Corrupted DB | Delete `data/inventory.db` and restart |
| Port in use | Change `PORT` in `.env` |

## Security

**Self-hosted, single-user** tool: the main security boundary is the default `127.0.0.1` bind. To expose on the LAN, set `HOST`, but then **HTTPS is strongly advised** (otherwise the Steam password transits in cleartext at login).

- **Zero credential storage**: the Steam password is handed to `steam-user` then immediately forgotten, never written to the DB, to disk or to the logs
- **Login on every session**: approval via the Steam mobile app (primary) or typed Steam Guard code (fallback). The Refresh button therefore requires a fresh Steam session, by design
- **Read routes are public by design** (personal use on a trusted network); only the inventory refresh requires a Steam session
- Proxies stored **encrypted with AES-256-GCM** at rest (key derived from `SESSION_SECRET` via scrypt)
- Sessions **in memory only**, wiped on server restart
- httpOnly + sameSite strict cookie; CSRF protection through Origin checks on writes
- Helmet (CSP, HSTS, XSS protection); rate limiting: 10 auth attempts / 15 min, 120 API req / min
- **Read-only**: the app cannot modify your inventory
- **Never commit** the `.env` file
- Recommended: use an alt account for testing
