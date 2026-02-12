# CS2 Inventory Tracker v2.0

Application web moderne pour monitorer en temps réel l'inventaire Counter-Strike 2 d'un utilisateur Steam, avec support des Storage Units (caskets) et suivi des prix multi-sources.

![Dashboard Preview](https://img.shields.io/badge/CS2-Inventory%20Tracker-orange?style=for-the-badge)

## ✨ Fonctionnalités

- 📦 **Storage Units** - Récupération prioritaire des items dans les caskets CS2 via Game Coordinator
- 💰 **Multi-sources prix** - Steam Market avec smart cache (20h TTL)
- 📊 **Historique** - Graphiques d'évolution de valeur (7/30/90 jours)
- 🎨 **UI moderne** - React + shadcn/ui avec thème sombre CS2
- 🔍 **Recherche & Tri** - Recherche temps réel, tri par prix/rareté/float
- 📤 **Export CSV** - Téléchargement de l'inventaire complet
- ⏰ **Auto-refresh** - Mise à jour automatique configurable
- 🔐 **Sécurité** - Chiffrement AES-256-GCM, rate limiting, helmet

## 🚀 Stack Technique

### Backend
- **Express + TypeScript** - API REST avec validation Zod
- **better-sqlite3 + Drizzle ORM** - Base de données performante (WAL mode)
- **Steam libraries** - steam-user, globaloffensive, steamcommunity

### Frontend
- **React + Vite** - Interface moderne avec hot-reload
- **shadcn/ui + Tailwind CSS** - Composants UI accessibles
- **TanStack React Query** - Data fetching avec cache
- **Recharts** - Graphiques interactifs

## 📦 Installation

### Prérequis

- Node.js v20 ou supérieur
- Compte Steam avec Steam Guard Mobile Authenticator activé
- npm ou pnpm

### Étapes

1. **Cloner le projet**

```bash
git clone <repo-url>
cd cs2-inventory-tracker
```

2. **Installer les dépendances**

```bash
npm install
```

3. **Configurer l'environnement**

```bash
cp .env.example .env
```

Éditer le fichier `.env` :

```env
PORT=3000
REFRESH_INTERVAL=10
SESSION_SECRET=<générer-une-clé-longue-aléatoire>
```

> ⚠️ **SESSION_SECRET** : Utilisez une clé forte (32+ caractères) pour chiffrer les credentials

4. **Lancer l'application**

**Mode développement** (hot-reload) :
```bash
npm run dev
```

**Mode production** :
```bash
npm run build
npm start
```

5. **Ouvrir le dashboard**

Naviguer vers [http://localhost:3000](http://localhost:3000)

Au premier lancement, vous serez invité à vous connecter avec :
- Username Steam
- Mot de passe Steam
- Code Steam Guard (si nécessaire)

## 📁 Structure du projet

```
cs2-inventory-tracker/
├── src/
│   ├── shared/                  # Types & constantes partagés
│   │   ├── types/               # Item, StorageUnit, API contracts
│   │   └── constants/           # Rarity, Wear, Weapons
│   │
│   ├── server/                  # Backend Express
│   │   ├── db/
│   │   │   ├── schema.ts        # Drizzle schema
│   │   │   └── queries/         # Requêtes typées
│   │   ├── features/
│   │   │   ├── steam/           # Steam client + inventory
│   │   │   ├── auth/            # Authentification
│   │   │   ├── inventory/       # Refresh, dashboard data
│   │   │   ├── pricing/         # Smart cache + market
│   │   │   ├── history/         # Snapshots & trends
│   │   │   └── export/          # CSV export
│   │   ├── middleware/          # Security, session, errors
│   │   └── lib/                 # Crypto, logger
│   │
│   └── client/                  # Frontend React
│       ├── features/
│       │   ├── auth/            # Login page
│       │   ├── dashboard/       # KPIs, chart, history
│       │   ├── inventory/       # Item cards, modal
│       │   └── storage-units/   # Collapsible caskets
│       ├── components/ui/       # shadcn components
│       ├── hooks/               # useApi, usePolling
│       └── lib/                 # API client, formatters
│
├── data/
│   ├── inventory.db             # SQLite database
│   └── item_schema.json         # CS2 item cache
├── drizzle/                     # SQL migrations
└── dist/                        # Production build
```

## ⚙️ Configuration

| Variable | Description | Défaut |
|----------|-------------|--------|
| `PORT` | Port du serveur | 3000 |
| `REFRESH_INTERVAL` | Intervalle refresh en minutes | 10 |
| `SESSION_SECRET` | Clé de chiffrement des credentials | - |

## 🔧 Scripts npm

| Commande | Description |
|----------|-------------|
| `npm run dev` | Dev mode (Express + Vite hot-reload) |
| `npm run build` | Build production (Vite) |
| `npm start` | Start production server |
| `npm run typecheck` | Vérification TypeScript |
| `npm run lint` | ESLint sur tout le code |
| `npm run db:generate` | Générer migrations Drizzle |

## 🛠️ Troubleshooting

### Erreur "Steam Guard"
- Vérifiez username/password sur la page de login
- Entrez le code Steam Guard à 5 chiffres

### Timeout GC (Game Coordinator)
- Le GC CS2 peut être instable, l'app retente automatiquement
- Attendez 30-60 secondes, le statut se met à jour

### Rate Limit 429
- Steam Market : limite ~20 req/min, l'app attend automatiquement
- Les prix sont mis en cache 20h (TTL) + fallback stale

### Storage Units vides
- Les caskets doivent contenir des items pour être détectés
- Vérifiez que votre inventaire CS2 est public

### Base de données corrompue
- Supprimer `data/inventory.db` et redémarrer

### Port 3000 occupé
- Modifier `PORT` dans `.env`
- Ou tuer le processus : `npx kill-port 3000`

## 🔐 Sécurité

### Chiffrement
- Credentials chiffrés AES-256-GCM en session (clé dérivée via scrypt)
- Cookie httpOnly + sameSite strict
- Session régénérée après login

### Rate Limiting
- Auth : 10 tentatives / 15 minutes
- API : 120 requêtes / minute

### Headers
- Helmet.js (CSP, HSTS, XSS protection)
- CORS restreint à localhost en dev

### Best Practices
- 🔐 **Ne commitez JAMAIS** le fichier `.env`
- 🧪 **Recommandé** : Utilisez un compte alt pour les tests
- 📖 **Lecture seule** : L'app ne peut pas modifier votre inventaire
- ⏱️ **Session longue** : Les connexions 24/7 peuvent déclencher des alertes Steam

## 📊 APIs utilisées

| Source | Endpoint | Rate Limit |
|--------|----------|------------|
| Steam Market | `/market/priceoverview` | ~20/min |
| ByMykel API | `/items-game/csgo/` | Cache 7 jours |
| Steam CDN | `community.akamai.steamstatic.com` | Illimité |

## 🚧 Améliorations futures

- [ ] Support multi-comptes
- [ ] Notifications Discord/Telegram
- [ ] Comparaison prix CSFloat/Skinport
- [ ] Export Excel avec charts
- [ ] Dark/Light theme toggle
- [ ] Mobile responsive optimization
- [ ] PWA support

## 📝 License

MIT License - Utilisation libre

---

**Développé avec ❤️ pour la communauté CS2**
