# CS2 Inventory Tracker v2

Tracker d'inventaire CS2 avec support Storage Units, prix multi-sources (Steam Market / CSFloat / Skinport) et historique de valeur.

**Stack** : Express + TypeScript / React + Vite / SQLite (better-sqlite3 + Drizzle) / shadcn/ui + Tailwind

## Prerequis

- **Node 22** (le champ `engines` impose `>=22 <23` et un fichier `.nvmrc` est fourni).
  Le module natif `better-sqlite3` ne compile pas sur Node 24 — restez sur Node 22.

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
| `HOST` | Adresse d'ecoute. Ne changer que pour exposer sur le LAN, et uniquement derriere HTTPS | `127.0.0.1` |
| `SESSION_SECRET` | Signe le cookie de session et chiffre les proxies stockes (AES-256-GCM) | - |
| `ALLOWED_ORIGINS` | Origines navigateur autorisees pour CORS + CSRF (ajouter votre host/IP LAN) | `http://localhost:5173,...` |
| `REFRESH_INTERVAL` | Auto-refresh inventaire (minutes) | `10` |
| `STEAM_PRICING_MODE` | `auto` / `proxy` / `direct` — modifiable aussi depuis la page Parametres | `auto` |
| `STEAM_PROXIES` | Proxies payants optionnels (`host:port:user:pass` ou `http://user:pass@host:port`), configurables aussi depuis l'UI | - |
| `STEAM_DIRECT_INTERVAL_MS` | Espacement (ms) entre requetes Steam en mode direct | `3500` |
| `PRICE_CACHE_TTL_HOURS` | Duree (heures) pendant laquelle un prix en cache est considere frais | `20` |
| `SKINPORT_TTL_MS` | TTL (ms) du cache de la liste de prix bulk Skinport | `600000` |
| `CSFLOAT_API_KEY` | Cle API CSFloat (requise en pratique, sinon `403`) | - |
| `NODE_ENV` | `development` ou `production` | `development` |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |

Toutes les variables de tuning fin (workers, timeouts, cooldowns, verification des proxies, cadence CSFloat...) sont documentees dans [`.env.example`](.env.example).

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Dev mode (Express + Vite hot-reload) |
| `npm run build` | Build production (Vite) |
| `npm start` | Serveur production |
| `npm test` | Tests unitaires (Vitest) |
| `npm run typecheck` | Verification TypeScript |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generer migrations Drizzle |
| `npm run db:migrate` | Appliquer migrations Drizzle |

## Fonctionnalites

- **3 sources de prix** :
  - **Steam Market** — pool de proxies (proxies residentiels payants) ou mode direct throttle sans proxy (`STEAM_PRICING_MODE=auto|proxy|direct`)
  - **CSFloat** — via cle API
  - **Skinport** — endpoint bulk, aucune cle requise
- **Une source a la fois** dans la vue principale (au choix : Steam, Steam net de frais, CSFloat, Skinport) ; le modal de detail d'un item affiche les prix des trois sources cote a cote
- **Page Parametres** : choix de la source de prix, mode pricing (auto/proxy/direct), gestion des proxies et langue — directement depuis l'UI, sans toucher au `.env`
- **Storage Units** : lecture des caskets CS2 via Game Coordinator, inclus dans l'inventaire et le dashboard
- **Multi-profils** : suivi de plusieurs comptes Steam, selection depuis la page d'accueil
- **Historique** : graphique d'evolution de valeur (7/30/90 jours)
- **Recherche & tri** : temps reel, par prix/nom/float
- **Export CSV** : telechargement de l'inventaire complet
- **i18n** : interface FR / EN
- **Auto-refresh** : cron configurable

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
      pricing/     Sources de prix (Steam proxy/direct, CSFloat, Skinport), queues + cache
      history/     Snapshots journaliers
      export/      Export CSV
      profiles/    Profils suivis
      settings/    Reglages persistes (mode pricing, proxies chiffres)
    middleware/    Session, security (helmet/cors/rate-limit), error handler
    lib/           Crypto, logger
  client/
    features/
      auth/        Login page + Steam Guard
      dashboard/   KPIs, graphique, historique, storage units
      inventory/   Item cards, modal detail (3 prix), float bar, stickers
      profiles/    Page d'accueil, selection du profil
      settings/    Source de prix, mode pricing, proxies, langue
    components/ui/ Composants shadcn
    hooks/         useApi, usePolling
    lib/           API client, i18n, formatters, cn
data/              SQLite DB + cache schema items
```

## Troubleshooting

| Probleme | Solution |
|---|---|
| `npm install` echoue sur better-sqlite3 | Verifier la version de Node : il faut Node 22 (`nvm use`) |
| Steam Guard demande | Approuver dans l'app mobile Steam, ou entrer le code 5 chiffres |
| Timeout GC | Le Game Coordinator CS2 peut etre instable, l'app retente auto |
| Rate limit 429 | Le cooldown est applique par worker/proxy, les autres workers continuent |
| CSFloat 401/403 | Verifier `CSFLOAT_API_KEY` (`raw` ou `Bearer <key>`), puis redemarrer |
| Storage Units vides | Verifier que les caskets contiennent des items |
| DB corrompue | Supprimer `data/inventory.db` et redemarrer |
| Port occupe | Changer `PORT` dans `.env` |

## Securite

Outil **auto-heberge, mono-utilisateur** : la frontiere de securite principale est l'ecoute sur `127.0.0.1` par defaut. Pour exposer sur le LAN, definir `HOST` — mais alors **HTTPS fortement conseille** (sinon le mot de passe Steam transite en clair au login).

- **Zero credential stocke** : le mot de passe Steam est transmis a `steam-user` puis aussitot oublie — jamais ecrit en DB, sur disque ni dans les logs
- **Login a chaque session** : approbation via l'app mobile Steam (principal) ou code Steam Guard saisi (fallback). Le bouton Refresh exige donc une session Steam fraiche — c'est voulu
- **Routes de lecture publiques par design** (usage perso sur reseau de confiance) ; seul le refresh d'inventaire necessite une session Steam
- Proxies stockes **chiffres AES-256-GCM** au repos (cle derivee de `SESSION_SECRET` via scrypt)
- Sessions **en memoire uniquement**, purgees au redemarrage du serveur
- Cookie httpOnly + sameSite strict ; protection CSRF par verification d'Origin sur les ecritures
- Helmet (CSP, HSTS, XSS protection) ; rate limiting : 10 tentatives auth / 15min, 120 req API / min
- **Lecture seule** : l'app ne peut pas modifier votre inventaire
- **Ne commitez jamais** le fichier `.env`
- Recommande : utiliser un compte alt pour les tests
