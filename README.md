# CS2 Inventory Tracker v2

Tracker d'inventaire CS2 avec support Storage Units, suivi des prix Steam Market et historique de valeur.

**Stack** : Express + TypeScript / React + Vite / SQLite (better-sqlite3 + Drizzle) / shadcn/ui + Tailwind

## Quick Start

```bash
# 1. Installer
npm install

# 2. Configurer
cp .env.example .env
# Editer .env : mettre un vrai SESSION_SECRET (voir .env.example pour la commande)

# 3. Dev (hot-reload frontend + backend)
npm run dev

# 4. Ouvrir http://localhost:5173
```

En production :

```bash
npm run build
npm start
# Ouvrir http://localhost:3000
```

## Configuration (.env)

| Variable | Description | Defaut |
|---|---|---|
| `PORT` | Port du serveur Express | `3000` |
| `REFRESH_INTERVAL` | Auto-refresh inventaire (minutes) | `10` |
| `SESSION_SECRET` | Cle de chiffrement AES-256-GCM pour les credentials Steam en session | - |
| `NODE_ENV` | `development` ou `production` | `development` |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |
| `STEAM_QUEUE_*` | Reglage fin de la cadence API Steam Market | `1 req / 3.5s` |
| `PRICE_STALE_HOURS` | Seuil d'age (heures) avant auto-refresh prix cron | `20` |
| `CSFLOAT_ENABLED` | Active la source de prix CSFloat | `true` |
| `CSFLOAT_QUEUE_*` | Reglage fin de la cadence API CSFloat | `1 req / 1.5s` |
| `CSFLOAT_USD_TO_EUR` | Taux de conversion CSFloat (USD vers EUR) | `0.92` |
| `CSFLOAT_API_KEY` | Cle API CSFloat (requise en pratique, sinon `403`) | - |
| `CSFLOAT_RATE_LIMIT_COOLDOWN_MS` | Attente de base (ms) apres un `429` CSFloat | `60000` |
| `CSFLOAT_RATE_LIMIT_MAX_COOLDOWN_MS` | Cap max (ms) du cooldown CSFloat (backoff auto) | `300000` |
| `CSFLOAT_FORBIDDEN_COOLDOWN_MS` | Cooldown applique apres un `401/403` CSFloat | `300000` |

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Dev mode (Express + Vite hot-reload) |
| `npm run build` | Build production (Vite) |
| `npm start` | Serveur production |
| `npm run typecheck` | Verification TypeScript |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generer migrations Drizzle |
| `npm run db:migrate` | Appliquer migrations Drizzle |

## Fonctionnalites

- **Storage Units** : lecture des caskets CS2 via Game Coordinator
- **Prix Steam Market** : cache intelligent (TTL 20h) avec fallback stale
- **Source CSFloat** : source de prix alternative selectionnable dans les parametres
- **Historique** : graphique d'evolution de valeur (7/30/90 jours)
- **Recherche & tri** : temps reel, par prix/nom/float
- **Export CSV** : telechargement de l'inventaire complet
- **Auto-refresh** : cron configurable
- **Securite** : chiffrement AES-256-GCM, rate limiting, helmet, cookies httpOnly

## Structure

```
src/
  shared/          Types & constantes partages (client + server)
  server/
    db/            Schema Drizzle + queries SQLite
    features/
      auth/        Login Steam, middleware auth
      steam/       Client Steam + inventaire + schema items
      inventory/   Refresh, dashboard data, cron jobs
      pricing/     Steam Market avec queue + cache
      history/     Snapshots journaliers
      export/      Export CSV
    middleware/    Session, security (helmet/cors/rate-limit), error handler
    lib/           Crypto, logger
  client/
    features/
      auth/        Login page + Steam Guard
      dashboard/   KPIs, graphique, historique
      inventory/   Item cards, modal detail, float bar, stickers
      storage-units/ Caskets collapsibles
      export/      Bouton export CSV
    components/ui/ Composants shadcn
    hooks/         useApi, usePolling
    lib/           API client, formatters, cn
data/              SQLite DB + cache schema items
```

## Troubleshooting

| Probleme | Solution |
|---|---|
| Steam Guard demande | Entrer le code 5 chiffres depuis l'app Steam |
| Timeout GC | Le Game Coordinator CS2 peut etre instable, l'app retente auto |
| Rate limit 429 | Steam Market ~20 req/min, l'app gere la queue et le cache |
| CSFloat 401/403 | Verifier `CSFLOAT_API_KEY` (`raw` ou `Bearer <key>`), puis redemarrer |
| Storage Units vides | Verifier que les caskets contiennent des items |
| DB corrompue | Supprimer `data/inventory.db` et redemarrer |
| Port occupe | Changer `PORT` dans `.env` |

## Securite

- Credentials chiffres AES-256-GCM en session (cle derivee via scrypt)
- Cookie httpOnly + sameSite strict
- Helmet (CSP, HSTS, XSS protection)
- Rate limiting : 10 tentatives auth / 15min, 120 req API / min
- **Ne commitez jamais** le fichier `.env`
- **Lecture seule** : l'app ne peut pas modifier votre inventaire
- Recommande : utiliser un compte alt pour les tests
