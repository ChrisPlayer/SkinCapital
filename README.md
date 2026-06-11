# CS2 Inventory Tracker v2

Tracker d'inventaire CS2 avec support Storage Units, prix multi-sources (Steam Market / CSFloat / Skinport) et historique de valeur.

**Stack** : Express + TypeScript / React + Vite / SQLite (better-sqlite3) / shadcn/ui + Tailwind

## Installation

### Windows

➡️ **[Télécharger la dernière version](https://github.com/ChrisPlayer/SkinCapital/releases/latest)** (`SkinCapital-win-x64-v*.zip`)

1. Décompressez le zip où vous voulez (clic droit → *Extraire tout*)
2. Double-cliquez sur **SkinCapital.exe** : une fenêtre s'ouvre avec les journaux du serveur, puis votre navigateur s'ouvre tout seul sur l'application
3. Pour arrêter : fermez la fenêtre (ou Ctrl+C)

Rien d'autre à installer. Vos données et votre connexion Steam restent sur **votre** ordinateur (dossier `data\` à côté de l'exe). Voir le `LISEZMOI.txt` inclus dans le zip.

### Docker

Image publiée sur GitHub Container Registry à chaque release :

```bash
docker run -d --name skincapital \
  -p 3000:3000 \
  -v skincapital-data:/data \
  ghcr.io/chrisplayer/skincapital:latest
```

Ou avec le [`docker-compose.yml`](docker-compose.yml) fourni : `docker compose up -d`. L'application écoute sur `http://localhost:3000` ; si vous y accédez par une autre URL (IP LAN, domaine), ajoutez-la à `ALLOWED_ORIGINS` (anti-CSRF) et passez derrière HTTPS avant d'exposer le login Steam hors de la machine.

---

La suite de ce document concerne l'installation **développeur** (depuis les sources).

## Prérequis

- **Node 22** (le champ `engines` impose `>=22 <23` et un fichier `.nvmrc` est fourni).
  Le module natif `better-sqlite3` ne compile pas sur Node 24 : restez sur Node 22.

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
npm run build        # client (vite) + bundle serveur (esbuild) dans dist/
npm run start:dist   # lance dist/server/server.cjs
# Ouvrir http://localhost:3000
```

Sans `SESSION_SECRET` dans le `.env`, le serveur en génère un au premier démarrage et le persiste dans `data/.session-secret` ; en définir un explicitement reste prioritaire.

## Configuration (.env)

| Variable | Description | Défaut |
|---|---|---|
| `PORT` | Port du serveur Express | `3000` |
| `HOST` | Adresse d'écoute. Ne changer que pour exposer sur le LAN, et uniquement derrière HTTPS | `127.0.0.1` |
| `SESSION_SECRET` | Signe le cookie de session et chiffre les proxies stockés (AES-256-GCM) | auto-généré, persisté dans `DATA_DIR` |
| `DATA_DIR` | Dossier des données (DB SQLite, cache schéma, secret) | `./data` |
| `OPEN_BROWSER` | Ouvre le navigateur au démarrage (`1`/`true`) : utilisé par le pack Windows | off |
| `ALLOWED_ORIGINS` | Origines navigateur autorisées pour CORS + CSRF (ajouter votre host/IP LAN) | `http://localhost:5173,...` |
| `REFRESH_INTERVAL` | Auto-refresh inventaire (minutes) | `10` |
| `STEAM_PRICING_MODE` | `auto` / `proxy` / `direct`, modifiable aussi depuis la page Paramètres | `auto` |
| `STEAM_PROXIES` | Proxies payants optionnels (`host:port:user:pass` ou `http://user:pass@host:port`), configurables aussi depuis l'UI | - |
| `STEAM_DIRECT_INTERVAL_MS` | Espacement (ms) entre requêtes Steam en mode direct | `3500` |
| `PRICE_CACHE_TTL_HOURS` | Durée (heures) pendant laquelle un prix en cache est considéré frais | `20` |
| `SKINPORT_TTL_MS` | TTL (ms) du cache de la liste de prix bulk Skinport | `600000` |
| `CSFLOAT_API_KEY` | Clé API CSFloat (requise en pratique, sinon `403`) | - |
| `NODE_ENV` | `development` ou `production` | `development` |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |
| `LOG_FILE` | Copie aussi les logs dans ce fichier (rotation à 5 Mo). Le pack Windows le pose sur `data\server.log` | off |

Toutes les variables de tuning fin (workers, timeouts, cooldowns, vérification des proxies, cadence CSFloat...) sont documentées dans [`.env.example`](.env.example).

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Dev mode (Express + Vite hot-reload) |
| `npm run build` | Build production : client (Vite) + bundle serveur (esbuild) |
| `npm start` | Serveur depuis les sources (tsx) |
| `npm run start:dist` | Serveur depuis le bundle de production |
| `npm test` | Tests unitaires (Vitest) |
| `npm run typecheck` | Vérification TypeScript |
| `npm run lint` | ESLint |
| `npm run package:win` | Pack Windows (`SkinCapital.exe`, sortie dans `release/`) |

## Release (mainteneurs)

Pousser un tag `v*` déclenche le workflow [release.yml](.github/workflows/release.yml) :
le zip Windows (exe Node SEA) est construit et attaché à la GitHub Release avec
des notes générées, et l'image Docker multi-arch est poussée sur
`ghcr.io/chrisplayer/skincapital` (tags `latest`, `X.Y.Z`, `X.Y`).

```bash
npm version minor        # bump + tag vX.Y.Z
git push --follow-tags
```

## Fonctionnalités

- **3 sources de prix** :
  - **Steam Market** : pool de proxies (proxies résidentiels payants) ou mode direct throttlé sans proxy (`STEAM_PRICING_MODE=auto|proxy|direct`)
  - **CSFloat** : via clé API
  - **Skinport** : endpoint bulk, aucune clé requise
- **Une source à la fois** dans la vue principale (au choix : Steam, Steam net de frais, CSFloat, Skinport) ; le modal de détail d'un item affiche les prix des trois sources côte à côte
- **Page Paramètres** : choix de la source de prix, mode pricing (auto/proxy/direct), gestion des proxies et langue, directement depuis l'UI, sans toucher au `.env`
- **Storage Units** : lecture des caskets CS2 via Game Coordinator, inclus dans l'inventaire et le dashboard
- **Multi-profils** : suivi de plusieurs comptes Steam, sélection depuis la page d'accueil
- **Historique** : graphique d'évolution de valeur (7/30/90 jours)
- **Recherche & tri** : temps réel, par prix/nom/float
- **Export CSV** : téléchargement de l'inventaire complet
- **i18n** : interface FR / EN
- **Auto-refresh** : cron configurable

## Structure

```
src/
  shared/          Types & constantes partagés (client + server)
  server/
    db/            Schéma SQLite (auto-init) + queries
    features/
      auth/        Login Steam, middleware auth
      steam/       Client Steam + inventaire + schéma items
      inventory/   Refresh, dashboard data, cron jobs
      pricing/     Sources de prix (Steam proxy/direct, CSFloat, Skinport), queues + cache
      history/     Snapshots journaliers
      export/      Export CSV
      profiles/    Profils suivis
      settings/    Réglages persistés (mode pricing, proxies chiffrés)
    middleware/    Session, security (helmet/cors/rate-limit), error handler
    lib/           Crypto, logger
  client/
    features/
      auth/        Login page + Steam Guard
      dashboard/   KPIs, graphique, historique, storage units
      inventory/   Item cards, modal détail (3 prix), float bar, stickers
      profiles/    Page d'accueil, sélection du profil
      settings/    Source de prix, mode pricing, proxies, langue
    components/ui/ Composants shadcn
    hooks/         useApi, usePolling
    lib/           API client, i18n, formatters, cn
data/              SQLite DB + cache schéma items
```

## Troubleshooting

| Problème | Solution |
|---|---|
| `npm install` échoue sur better-sqlite3 | Vérifier la version de Node : il faut Node 22 (`nvm use`) |
| Steam Guard demandé | Approuver dans l'app mobile Steam, ou entrer le code 5 chiffres |
| Timeout GC | Le Game Coordinator CS2 peut être instable, l'app retente auto |
| Rate limit 429 | Le cooldown est appliqué par worker/proxy, les autres workers continuent |
| CSFloat 401/403 | Vérifier `CSFLOAT_API_KEY` (`raw` ou `Bearer <key>`), puis redémarrer |
| Storage Units vides | Vérifier que les caskets contiennent des items |
| DB corrompue | Supprimer `data/inventory.db` et redémarrer |
| Port occupé | Changer `PORT` dans `.env` |

## Sécurité

Outil **auto-hébergé, mono-utilisateur** : la frontière de sécurité principale est l'écoute sur `127.0.0.1` par défaut. Pour exposer sur le LAN, définir `HOST`, mais alors **HTTPS fortement conseillé** (sinon le mot de passe Steam transite en clair au login).

- **Zéro credential stocké** : le mot de passe Steam est transmis à `steam-user` puis aussitôt oublié, jamais écrit en DB, sur disque ni dans les logs
- **Login à chaque session** : approbation via l'app mobile Steam (principal) ou code Steam Guard saisi (fallback). Le bouton Refresh exige donc une session Steam fraîche, c'est voulu
- **Routes de lecture publiques par design** (usage perso sur réseau de confiance) ; seul le refresh d'inventaire nécessite une session Steam
- Proxies stockés **chiffrés AES-256-GCM** au repos (clé dérivée de `SESSION_SECRET` via scrypt)
- Sessions **en mémoire uniquement**, purgées au redémarrage du serveur
- Cookie httpOnly + sameSite strict ; protection CSRF par vérification d'Origin sur les écritures
- Helmet (CSP, HSTS, XSS protection) ; rate limiting : 10 tentatives auth / 15 min, 120 req API / min
- **Lecture seule** : l'app ne peut pas modifier votre inventaire
- **Ne commitez jamais** le fichier `.env`
- Recommandé : utiliser un compte alt pour les tests
