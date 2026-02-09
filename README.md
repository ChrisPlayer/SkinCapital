# CS2 Inventory Tracker

Application web complète pour monitorer en temps réel l'inventaire Counter-Strike 2 d'un utilisateur Steam, avec support des Storage Units (caskets) et suivi des prix multi-sources.

![Dashboard Preview](https://img.shields.io/badge/CS2-Inventory%20Tracker-orange?style=for-the-badge)

## ✨ Fonctionnalités

- 📦 **Storage Units** - Récupération prioritaire des items dans les caskets CS2 via Game Coordinator
- 💰 **Multi-sources prix** - Steam Market, CSFloat, Skinport avec moyennes
- 📊 **Historique** - Graphiques d'évolution de valeur (7/30 jours)
- 🔔 **Alertes** - Notifications pour les items avec ±5% de variation
- 📤 **Export CSV** - Téléchargement de l'inventaire complet
- ⏰ **Auto-refresh** - Mise à jour automatique toutes les 10 minutes

## 🚀 Installation

### Prérequis

- Node.js v18 ou supérieur
- Compte Steam avec Steam Guard Mobile Authenticator activé

### Étapes

1. **Cloner/Télécharger le projet**

```bash
cd cs2-inventory-tracker
```

2. **Installer les dépendances**

```bash
npm install
```

3. **Configurer les credentials**

```bash
cp .env.example .env
```

Éditer le fichier `.env` avec vos informations :

```env
STEAM_USERNAME=votre_username_steam
STEAM_PASSWORD=votre_mot_de_passe
STEAM_SHARED_SECRET=votre_shared_secret_2FA
PORT=3000
REFRESH_INTERVAL=10
```

> ⚠️ **Où trouver le Shared Secret ?**
> - Application Steam Desktop Authenticator (SDA) : fichier `maFiles/*.maFile`
> - Ou utiliser des outils comme `steam-totp` pour extraire le secret

4. **Lancer l'application**

```bash
npm start
```

5. **Ouvrir le dashboard**

Naviguer vers [http://localhost:3000](http://localhost:3000)

## 📁 Structure du projet

```
cs2-inventory-tracker/
├── server.js              # Point d'entrée Express
├── config/
│   └── database.js        # Configuration SQLite
├── services/
│   ├── steamAuth.js       # Connexion Steam + GC
│   ├── inventoryService.js # Fetch inventaire + Storage Units
│   ├── priceService.js    # APIs de prix (Steam/CSFloat/Skinport)
│   └── historyService.js  # Historique et snapshots
├── routes/
│   └── dashboard.js       # Routes Express
├── views/
│   ├── layout.ejs         # Template de base
│   ├── login.ejs          # Page de connexion
│   └── dashboard.ejs      # Dashboard principal
├── public/
│   └── js/chart-config.js # Configuration Chart.js
└── inventory.db           # Base SQLite (auto-créée)
```

## ⚙️ Configuration

| Variable | Description | Défaut |
|----------|-------------|--------|
| `STEAM_USERNAME` | Username Steam | - |
| `STEAM_PASSWORD` | Mot de passe Steam | - |
| `STEAM_SHARED_SECRET` | Secret 2FA Steam Guard | - |
| `PORT` | Port du serveur | 3000 |
| `REFRESH_INTERVAL` | Intervalle refresh en minutes | 10 |
| `USD_TO_EUR_RATE` | Taux de conversion USD→EUR | 0.92 |

## 🔧 Troubleshooting

### Erreur "Steam Guard"
- Vérifiez que `STEAM_SHARED_SECRET` est correct
- Le format est une chaîne Base64 (ex: `XXXXX=`)

### Timeout GC (Game Coordinator)
- Le GC CS2 peut être instable, l'app retente automatiquement
- Vérifiez que CS2 est à jour sur votre compte

### Rate Limit 429
- Steam Market : limite 20 req/min, l'app attend 60s automatiquement
- Les prix sont mis en cache pour éviter les appels répétés

### Storage Units vides
- Les caskets doivent contenir des items pour être détectés
- Vérifiez que votre inventaire CS2 est public

### Base de données corrompue
- Supprimer `inventory.db` et redémarrer l'app

## ⚠️ Avertissements de sécurité

> **IMPORTANT : Lisez attentivement !**

- 🔐 **Ne partagez JAMAIS** votre fichier `.env`
- 🧪 **Recommandé** : Utilisez un compte alt pour les tests
- 📖 **Lecture seule** : L'app ne peut pas modifier votre inventaire
- ⏱️ **Session longue** : Les connexions 24/7 peuvent déclencher des alertes Steam

## 📊 APIs utilisées

| Source | Endpoint | Rate Limit |
|--------|----------|------------|
| Steam Market | `/market/priceoverview` | 20/min |
| CSFloat | `/v1/listings` | 60/min |
| Skinport | `/v1/items` | 120/min |

## 📝 License

MIT License - Utilisation libre

---

**Développé avec ❤️ pour la communauté CS2**
