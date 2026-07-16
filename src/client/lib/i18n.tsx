import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { setFormatterLocale } from './formatters.ts';

export type Locale = 'fr' | 'en';
export type PriceProvider = 'steam' | 'steam_fees' | 'csfloat' | 'skinport';

function applySteamSellerFees(price: number): number {
  const grossCents = Math.max(0, Math.round(price * 100));
  if (grossCents === 0) return 0;

  // Steam market fees are applied separately and rounded up per fee.
  const steamFeeCents = Math.max(1, Math.ceil(grossCents * 0.10));
  const gameFeeCents = Math.max(1, Math.ceil(grossCents * 0.05));
  const netCents = Math.max(0, grossCents - steamFeeCents - gameFeeCents);
  return netCents / 100;
}

export function applyFees(price: number | null, provider: PriceProvider): number | null {
  if (price === null) return null;
  if (provider === 'steam_fees') return applySteamSellerFees(price);
  return price;
}

const translations = {
  // ── Common ──
  'common.retry': { fr: 'Réessayer', en: 'Retry' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel' },
  'dialog.close': { fr: 'Fermer', en: 'Close' },

  // ── Auth ──
  'auth.steamAuth': { fr: 'Connexion Steam', en: 'Steam Login' },
  'auth.username': { fr: 'Nom d\'utilisateur Steam', en: 'Steam Username' },
  'auth.usernamePlaceholder': { fr: 'Votre nom d\'utilisateur Steam', en: 'Your Steam username' },
  'auth.password': { fr: 'Mot de passe', en: 'Password' },
  'auth.passwordPlaceholder': { fr: 'Votre mot de passe Steam', en: 'Your Steam password' },
  'auth.connecting': { fr: 'Connexion...', en: 'Connecting...' },
  'auth.login': { fr: 'Se connecter', en: 'Log in' },
  'auth.backToProfiles': { fr: 'Retour aux profils', en: 'Back to profiles' },
  'auth.steamGuardRequired': { fr: 'Code Steam Guard requis', en: 'Steam Guard code required' },
  'auth.enter2fa': { fr: 'Entrer le code Steam Guard', en: 'Enter Steam Guard code' },
  'auth.validating': { fr: 'Validation...', en: 'Validating...' },
  'auth.validate': { fr: 'Valider', en: 'Validate' },
  'auth.confirmMobile': { fr: 'Valide la connexion dans ton app Steam mobile', en: 'Approve the login in your Steam mobile app' },
  'auth.mobileWaiting': { fr: 'En attente de ta validation sur le mobile…', en: 'Waiting for your approval on mobile…' },
  'auth.codeFallback': { fr: 'ou entre le code ci-dessous (secours)', en: 'or enter the code below (fallback)' },
  'auth.backToCredentials': { fr: 'Utiliser un autre compte', en: 'Use a different account' },

  // ── Profiles ──
  'profiles.addAccount': { fr: 'Ajouter un compte', en: 'Add account' },
  'profiles.yourProfiles': { fr: 'Vos profils', en: 'Your profiles' },
  'profiles.selectProfile': { fr: 'Sélectionne un profil', en: 'Select a profile' },
  'profiles.items': { fr: 'Items', en: 'Items' },
  'profiles.value': { fr: 'Valeur', en: 'Value' },
  'profiles.lastSync': { fr: 'Dernière synchronisation', en: 'Last sync' },
  'profiles.neverSynced': { fr: 'Jamais synchronisé', en: 'Never synced' },
  'profiles.noProfiles': { fr: 'Aucun profil', en: 'No profiles' },
  'profiles.noProfilesDesc': {
    fr: 'Connectez-vous avec votre compte Steam pour commencer le suivi de votre inventaire CS2.',
    en: 'Log in with your Steam account to start tracking your CS2 inventory.',
  },
  'profiles.loadError': { fr: 'Erreur de chargement des profils.', en: 'Failed to load profiles.' },
  'profiles.delete': { fr: 'Supprimer le profil', en: 'Delete profile' },
  'profiles.deleteConfirm': {
    fr: 'Supprimer ce profil et toutes ses données (items, achats, alertes, historique) ? Cette action est définitive.',
    en: 'Delete this profile and all its data (items, purchases, alerts, history)? This cannot be undone.',
  },
  'toast.profileDeleted': { fr: 'Profil supprimé', en: 'Profile deleted' },

  // ── Multi-account overview (home page banner) ──
  'overview.title': { fr: 'Vue combinée', en: 'Combined overview' },
  'overview.combinedValue': { fr: 'Valeur combinée', en: 'Combined value' },
  'overview.totalItems': { fr: 'Items au total', en: 'Total items' },
  'overview.accounts': { fr: 'Comptes', en: 'Accounts' },
  'overview.topItems': { fr: 'Top items combinés', en: 'Combined top items' },
  'overview.itemsOnly': { fr: 'Valeurs Steam, hors stickers.', en: 'Steam values, stickers excluded.' },

  // ── Dashboard nav ──
  'nav.dashboard': { fr: 'Dashboard', en: 'Dashboard' },
  'nav.inventory': { fr: 'Inventaire', en: 'Inventory' },
  'nav.storageUnits': { fr: 'Storage Units', en: 'Storage Units' },
  'nav.terminal': { fr: 'Navigation', en: 'Navigation' },
  'nav.account': { fr: 'Compte', en: 'Account' },
  'nav.profiles': { fr: 'Profils', en: 'Profiles' },
  'nav.logout': { fr: 'Déconnecter Steam', en: 'Sign out of Steam' },
  'nav.settings': { fr: 'Paramètres', en: 'Settings' },

  // ── Dashboard header ──
  'dashboard.marketOverview': { fr: 'Vue d\'ensemble', en: 'Market Overview' },
  'dashboard.inventory': { fr: 'Inventaire', en: 'Inventory' },
  'dashboard.storageUnits': { fr: 'Storage Units', en: 'Storage Units' },
  'dashboard.syncing': { fr: 'Synchronisation', en: 'Syncing' },
  // Refresh outcome (surfaced when a full inventory refresh ends without applying)
  'sync.failedIncomplete': {
    fr: 'Refresh annulé : lecture Steam incomplète — inventaire existant conservé ({kept} items). Réessayez plus tard.',
    en: 'Refresh aborted: incomplete Steam fetch — existing inventory kept ({kept} items). Try again later.',
  },
  'sync.failed': { fr: 'Échec du refresh inventaire : {error}', en: 'Inventory refresh failed: {error}' },
  'dashboard.refreshPrices': { fr: 'Refresh Prix', en: 'Refresh Prices' },
  'dashboard.refreshPricesTooltip': { fr: 'Rafraîchir les prix (sans connexion Steam)', en: 'Refresh prices (no Steam login needed)' },
  'dashboard.refreshInventory': { fr: 'Refresh Inventaire', en: 'Refresh Inventory' },
  'dashboard.refreshInventoryTooltip': { fr: 'Rafraîchir l\'inventaire (nécessite connexion Steam)', en: 'Refresh inventory (requires Steam login)' },
  'dashboard.priceWindowTooltip': { fr: 'Fenêtre de mise à jour des prix', en: 'Price update window' },
  'dashboard.exportCsv': { fr: 'Exporter CSV', en: 'Export CSV' },
  'dashboard.loadError': { fr: 'Erreur de chargement des données.', en: 'Failed to load data.' },

  // ── Dashboard KPIs ──
  'dashboard.portfolioPerformance': { fr: 'Performance du portefeuille', en: 'Portfolio performance' },
  'dashboard.itemsLabel': { fr: 'items', en: 'items' },
  'dashboard.uniqueLabel': { fr: 'uniques', en: 'unique' },
  'dashboard.netValuation': { fr: 'Valeur nette', en: 'Net valuation' },
  'dashboard.noChartData': { fr: 'Aucune donnée', en: 'No chart data' },
  'dashboard.topAssets': { fr: 'Top Items', en: 'Top Assets' },
  'dashboard.invested': { fr: 'Investi', en: 'Invested' },

  // ── Search & Sort ──
  'search.placeholder': { fr: 'Rechercher...', en: 'Search...' },
  'search.label': { fr: 'Rechercher', en: 'Search' },
  'search.clear': { fr: 'Effacer la recherche', en: 'Clear search' },
  'sort.price': { fr: 'Prix', en: 'Price' },
  'sort.name': { fr: 'Nom', en: 'Name' },
  'sort.float': { fr: 'Float', en: 'Float' },
  'sort.quantity': { fr: 'Quantité', en: 'Quantity' },
  'sort.by': { fr: 'Trier par', en: 'Sort by' },
  'sort.direction': { fr: 'Inverser le sens du tri', en: 'Toggle sort direction' },
  'sort.value': { fr: 'Valeur', en: 'Value' },
  'sort.itemCount': { fr: 'Nombre d\'items', en: 'Item count' },

  // ── Filters ──
  'filter.rarity': { fr: 'Rareté', en: 'Rarity' },
  'filter.type': { fr: 'Type', en: 'Type' },
  'filter.quality': { fr: 'Qualité', en: 'Quality' },
  'filter.all': { fr: 'Tous', en: 'All' },
  'filter.normal': { fr: 'Normal', en: 'Normal' },
  'filter.withStickers': { fr: 'Avec stickers', en: 'With stickers' },
  'filter.notablePatterns': { fr: 'Patterns notables', en: 'Notable patterns' },
  'filter.reset': { fr: 'Réinitialiser', en: 'Reset' },
  'type.knife': { fr: 'Couteaux', en: 'Knives' },
  'type.gloves': { fr: 'Gants', en: 'Gloves' },
  'type.rifle': { fr: 'Fusils', en: 'Rifles' },
  'type.pistol': { fr: 'Pistolets', en: 'Pistols' },
  'type.smg': { fr: 'SMG', en: 'SMG' },
  'type.sniper': { fr: 'Snipers', en: 'Snipers' },
  'type.heavy': { fr: 'Lourds', en: 'Heavy' },
  'type.sticker': { fr: 'Stickers', en: 'Stickers' },
  'type.case': { fr: 'Caisses', en: 'Cases' },
  'type.agent': { fr: 'Agents', en: 'Agents' },
  'type.other': { fr: 'Autres', en: 'Other' },

  // ── Rare patterns / finishes ──
  'patterns.title': { fr: 'Patterns notables', en: 'Notable patterns' },
  'patterns.fnlow': { fr: 'Float très bas', en: 'Very low float' },
  'patterns.nearzero': { fr: 'Float quasi nul', en: 'Near-zero float' },
  'patterns.bluegem': { fr: 'Blue Gem', en: 'Blue Gem' },

  // ── Portfolio composition ──
  'portfolio.composition': { fr: 'Répartition du portefeuille', en: 'Portfolio breakdown' },

  // ── Top movers ──
  'movers.title': { fr: 'Top variations', en: 'Top movers' },
  'movers.gainers': { fr: 'Hausses', en: 'Gainers' },
  'movers.losers': { fr: 'Baisses', en: 'Losers' },
  'movers.none': { fr: 'Pas assez de données', en: 'Not enough data' },

  // ── Market trends (market-wide, not profile-scoped) ──
  'trends.title': { fr: 'Tendances du marché', en: 'Market trends' },
  'trends.caption': {
    fr: 'Couvre uniquement les items déjà suivis par l\'app (items possédés/rafraîchis + leurs stickers), pas tout le marché Steam.',
    en: 'Covers only items the app has already tracked (owned/refreshed items + their stickers), not the entire Steam market.',
  },
  'trends.none': { fr: 'Pas assez d\'historique', en: 'Not enough history' },
  'trends.noneDesc': {
    fr: 'Les tendances apparaîtront ici après quelques jours de prix collectés.',
    en: 'Trends will appear here after a few days of collected prices.',
  },

  // ── Pagination ──
  'pagination.prevPage': { fr: 'Page précédente', en: 'Previous page' },
  'pagination.nextPage': { fr: 'Page suivante', en: 'Next page' },

  // ── Empty states ──
  'empty.noResults': { fr: 'Aucun résultat', en: 'No results found' },
  'empty.noResultsDesc': { fr: 'Essaie d\'ajuster la recherche ou les filtres.', en: 'Try adjusting your search or filters.' },
  'empty.noStorageUnits': { fr: 'Aucune storage unit', en: 'No storage units' },
  'empty.noStorageUnitsDesc': { fr: 'Les storage units apparaîtront ici après un refresh de l\'inventaire.', en: 'Storage units will appear here after an inventory refresh.' },
  'empty.moversDesc': { fr: 'Les variations de prix apparaîtront ici après quelques jours de données.', en: 'Price changes will show up here after a few days of data.' },

  // ── Activity Feed ──
  'feed.activity': { fr: 'Activité', en: 'Activity' },
  'feed.showPanel': { fr: 'Afficher le panneau', en: 'Show panel' },
  'feed.system': { fr: 'Système', en: 'System' },
  'feed.syncingTitle': { fr: 'Synchronisation...', en: 'Syncing...' },
  'feed.syncingDesc': { fr: 'Rafraîchissement de l\'inventaire en cours. Les prix sont mis à jour...', en: 'Inventory refresh in progress. Prices are being fetched...' },
  'feed.priceRefreshDesc': { fr: 'Mise à jour des prix en cours...', en: 'Price refresh in progress...' },
  'feed.cancelRefresh': { fr: 'Annuler le refresh', en: 'Cancel refresh' },
  'feed.pricesStale': { fr: 'Prix à rafraîchir', en: 'Prices need refresh' },
  'feed.pricesStaleDesc': {
    fr: 'Les prix datent d\'environ {hours}h. Lance un refresh prix.',
    en: 'Prices are about {hours}h old. Trigger a price refresh.',
  },
  'feed.syncComplete': { fr: 'Sync terminée', en: 'Sync Complete' },
  'feed.itemsSynced': { fr: 'items synchronisés', en: 'items synced' },
  'feed.showAll': { fr: 'Voir tout', en: 'Show all' },
  'feed.showLess': { fr: 'Voir moins', en: 'Show less' },

  // ── Price Alerts ──
  'alerts.title': { fr: 'Alertes Prix', en: 'Price Alerts' },
  'alerts.priceUp': { fr: 'Prix en hausse', en: 'Price increase' },
  'alerts.priceDown': { fr: 'Prix en baisse', en: 'Price decrease' },
  'alerts.moderateUp': { fr: 'Hausse modérée', en: 'Moderate increase' },
  'alerts.moderateDown': { fr: 'Baisse modérée', en: 'Moderate decrease' },
  'alerts.noAlerts': { fr: 'Aucune alerte', en: 'No alerts' },
  'alerts.custom': { fr: 'Alertes personnalisées', en: 'Custom alerts' },
  'alerts.create': { fr: 'Créer', en: 'Create' },
  'alerts.triggered': { fr: 'Déclenchée', en: 'Triggered' },
  'alerts.none': { fr: 'Aucune alerte personnalisée', en: 'No custom alerts' },
  'alerts.priceAlert': { fr: 'Alerte prix', en: 'Price alert' },
  'alerts.steamBasis': {
    fr: 'Vérifiée sur le prix Steam uniquement (pas CSFloat/Skinport)',
    en: 'Checked against the Steam price only (not CSFloat/Skinport)',
  },

  // ── Daily History ──
  'history.title': { fr: 'Historique journalier', en: 'Daily History' },
  'history.noHistory': { fr: 'Aucun historique', en: 'No History' },

  // ── Item Detail Modal ──
  'item.stickers': { fr: 'Stickers', en: 'Stickers' },
  'item.float': { fr: 'Float', en: 'Float' },
  'item.priceError': { fr: 'Impossible de charger les prix', en: 'Failed to load prices' },
  'item.priceHistory': { fr: 'Historique 30j', en: '30d history' },
  'item.buyPrice': { fr: 'Prix d\'achat', en: 'Buy price' },
  'item.pnl': { fr: 'P&L', en: 'P&L' },
  'item.save': { fr: 'Enregistrer', en: 'Save' },
  'item.clear': { fr: 'Effacer', en: 'Clear' },

  // ── Settings ──
  'settings.title': { fr: 'Paramètres', en: 'Settings' },
  'settings.language': { fr: 'Langue', en: 'Language' },
  'settings.french': { fr: 'Français', en: 'French' },
  'settings.english': { fr: 'Anglais', en: 'English' },
  'settings.back': { fr: 'Retour', en: 'Back' },
  'settings.priceProvider': { fr: 'Source des prix', en: 'Price source' },
  'settings.steam': { fr: 'Steam Market', en: 'Steam Market' },
  'settings.csfloat': { fr: 'CSFloat', en: 'CSFloat' },
  'settings.skinport': { fr: 'Skinport', en: 'Skinport' },
  'settings.steamFees': { fr: 'Steam (- frais)', en: 'Steam (- fees)' },
  'settings.steamFeesDesc': { fr: 'Steam (- frais) applique les frais Steam/CS2. CSFloat est une source séparée.', en: 'Steam (- fees) applies Steam/CS2 seller fees. CSFloat is a separate source.' },
  'settings.pricingMethod': { fr: 'Méthode de récupération des prix', en: 'Price fetch method' },
  'settings.pricingMethodDesc': { fr: 'Avec proxies = rapide. Sans = connexion directe, plus lente mais complète et jamais bloquée par Steam.', en: 'With proxies = fast. Without = direct connection, slower but complete and never rate-limited by Steam.' },
  'settings.modeAuto': { fr: 'Auto', en: 'Auto' },
  'settings.modeProxy': { fr: 'Proxies (rapide)', en: 'Proxies (fast)' },
  'settings.modeDirect': { fr: 'Direct (lent)', en: 'Direct (slow)' },
  'settings.modeAutoHint': { fr: 'Auto : utilise les proxies si renseignés, sinon direct.', en: 'Auto: uses proxies if set, otherwise direct.' },
  'settings.proxiesHint': { fr: 'Formats acceptés : host:port:user:pass ou http://user:pass@host:port. Une seule gateway rotative suffit.', en: 'Accepted: host:port:user:pass or http://user:pass@host:port. A single rotating gateway is enough.' },
  'settings.save': { fr: 'Enregistrer', en: 'Save' },
  'settings.saved': { fr: 'Enregistré', en: 'Saved' },
  'settings.activeMode': { fr: 'Mode actif', en: 'Active mode' },
  'settings.proxiesCurrent': { fr: 'Proxies actuels', en: 'Current proxies' },
  'settings.proxiesNone': { fr: 'Aucun (mode direct)', en: 'None (direct mode)' },
  'settings.proxiesNew': { fr: 'Nouveaux proxies (laisser vide = conserver)', en: 'New proxies (leave blank to keep)' },
  'settings.test': { fr: 'Tester', en: 'Test' },
  'settings.testing': { fr: 'Test...', en: 'Testing...' },
  'settings.reset': { fr: 'Réinitialiser (.env)', en: 'Reset (.env)' },
  'settings.accent': { fr: 'Couleur d\'accent', en: 'Accent color' },
  'settings.autoPrices': { fr: 'Prix automatiques', en: 'Automatic prices' },
  'settings.autoPricesDesc': {
    fr: 'Recharge chaque jour les prix des items déjà en base, à l\'heure choisie — sans connexion Steam. Les nouveaux items demandent une connexion + refresh inventaire.',
    en: 'Reloads prices for items already in the database every day at the chosen time — no Steam login involved. New items require logging in + an inventory refresh.',
  },
  'settings.autoPricesOn': { fr: 'Activé', en: 'Enabled' },
  'settings.autoPricesOff': { fr: 'Désactivé', en: 'Disabled' },
  'settings.runNow': { fr: 'Lancer maintenant', en: 'Run now' },
  'toast.scheduleSaved': { fr: 'Planification enregistrée', en: 'Schedule saved' },
  'toast.runStarted': { fr: 'Rechargement des prix lancé', en: 'Price reload started' },
  'toast.runAlready': { fr: 'Un rechargement est déjà en cours', en: 'A reload is already running' },

  // ── Automatic backup ──
  'settings.backup': { fr: 'Sauvegarde automatique', en: 'Automatic backup' },
  'settings.backupDesc': {
    fr: 'Exporte chaque jour (03:00) vos profils, items, achats, alertes, historique et réglages dans un fichier JSON. Les 14 dernières sauvegardes sont conservées.',
    en: 'Exports your profiles, items, purchases, alerts, history and settings to a JSON file every day (03:00). The last 14 backups are kept.',
  },
  'settings.backupNow': { fr: 'Sauvegarder maintenant', en: 'Back up now' },
  'settings.backupDownload': { fr: 'Télécharger la dernière sauvegarde', en: 'Download latest backup' },
  'settings.backupLast': { fr: 'Dernière sauvegarde', en: 'Last backup' },
  'settings.backupNone': { fr: 'Aucune sauvegarde pour le moment', en: 'No backup yet' },
  'settings.backupCount': { fr: 'sauvegardes', en: 'backups' },
  'settings.backupOn': { fr: 'Activée', en: 'Enabled' },
  'settings.backupOff': { fr: 'Désactivée', en: 'Disabled' },
  'settings.backupList': { fr: 'Sauvegardes conservées', en: 'Retained backups' },
  'settings.backupHide': { fr: 'Masquer', en: 'Hide' },
  'settings.backupRestore': { fr: 'Restaurer', en: 'Restore' },
  'settings.backupRestoreConfirm': {
    fr: 'Remplacer toutes les données actuelles par cette sauvegarde ? L\'état actuel est sauvegardé juste avant (opération réversible).',
    en: 'Replace all current data with this backup? The current state is backed up just before (the operation is reversible).',
  },
  'toast.backupDone': { fr: 'Sauvegarde effectuée', en: 'Backup completed' },
  'toast.backupRunning': { fr: 'Une sauvegarde est déjà en cours', en: 'A backup is already running' },
  'toast.backupFailed': { fr: 'Échec de la sauvegarde', en: 'Backup failed' },
  'toast.restoreDone': { fr: 'Sauvegarde restaurée', en: 'Backup restored' },
  'toast.restoreFailed': { fr: 'Échec de la restauration', en: 'Restore failed' },

  // ── Toasts ──
  'toast.settingsSaved': { fr: 'Paramètres enregistrés', en: 'Settings saved' },
  'toast.settingsReset': { fr: 'Paramètres réinitialisés', en: 'Settings reset' },
  'toast.proxyOk': { fr: 'Proxy OK', en: 'Proxy OK' },
  'toast.proxyFail': { fr: 'Échec du test proxy', en: 'Proxy test failed' },
  'toast.buyPriceSaved': { fr: 'Prix d\'achat enregistré', en: 'Buy price saved' },
  'toast.buyPriceCleared': { fr: 'Prix d\'achat effacé', en: 'Buy price cleared' },
  'toast.alertCreated': { fr: 'Alerte créée', en: 'Alert created' },
  'toast.alertDeleted': { fr: 'Alerte supprimée', en: 'Alert deleted' },
  'toast.refreshError': { fr: 'Échec du rafraîchissement', en: 'Refresh failed' },

  // ── Login teaser ──
  'login.teaser': { fr: 'Reprends ton suivi', en: 'Pick up where you left off' },

  // ── View toggle ──
  'view.list': { fr: 'Liste', en: 'List' },
  'view.cards': { fr: 'Cartes', en: 'Cards' },
  'view.compact': { fr: 'Compact', en: 'Compact' },

  // ── Inventory ──
  'inventory.includeStorage': { fr: 'Inclure Storage Units', en: 'Include Storage Units' },
  'storage.emptyUnits': { fr: 'Storage Units vides', en: 'Empty Storage Units' },
  'storage.showAll': { fr: 'Tout afficher ({n})', en: 'Show all ({n})' },

  // ── Account status widget ──
  'status.connected': { fr: 'Connecté', en: 'Connected' },
  'status.disconnected': { fr: 'Déconnecté', en: 'Disconnected' },
  'status.phase.logging_in': { fr: 'Connexion Steam…', en: 'Signing in to Steam…' },
  'status.phase.awaiting_steam_guard': { fr: 'En attente de Steam Guard…', en: 'Waiting for Steam Guard…' },
  'status.phase.launching_cs2': { fr: 'Démarrage CS2…', en: 'Starting CS2…' },
  'status.phase.waiting_gc': { fr: 'Attente du Game Coordinator…', en: 'Waiting for Game Coordinator…' },
  'status.phase.fetching_inventory': { fr: 'Scan de l\'inventaire…', en: 'Scanning inventory…' },
  'status.phase.fetching_storage': { fr: 'Scan des storage units', en: 'Scanning storage units' },
  'status.phase.fetching_prices': { fr: 'Récupération des prix', en: 'Fetching prices' },
  'status.phase.disconnecting': { fr: 'Déconnexion…', en: 'Disconnecting…' },

  // ── Logout confirmation ──
  'logout.title': { fr: 'Déconnecter la session Steam ?', en: 'Sign out of the Steam session?' },
  'logout.description': {
    fr: 'La session Steam active sera fermée. Tes données et l\'historique restent consultables ; il faudra te reconnecter pour rafraîchir l\'inventaire.',
    en: 'The active Steam session will be closed. Your data and history stay available; you\'ll need to log in again to refresh the inventory.',
  },
  'logout.confirm': { fr: 'Déconnecter', en: 'Sign out' },
  'logout.cancel': { fr: 'Annuler', en: 'Cancel' },
  'toast.loggedOut': { fr: 'Session Steam déconnectée', en: 'Steam session signed out' },

  // ── Activity tab & live toasts ──
  'nav.activity': { fr: 'Activité', en: 'Activity' },
  'toast.refreshStarted': { fr: 'Synchronisation démarrée', en: 'Sync started' },
  'toast.refreshDone': { fr: 'Inventaire synchronisé', en: 'Inventory synced' },
  'toast.pricesRefreshDone': { fr: 'Prix mis à jour', en: 'Prices updated' },
  'toast.alertTriggered': { fr: 'Alerte déclenchée : ', en: 'Alert triggered: ' },
  'toast.inventoryChanged': { fr: 'Inventaire modifié', en: 'Inventory changed' },
  'feed.movements': { fr: 'Mouvements d\'inventaire', en: 'Inventory movements' },
  'movements.none': { fr: 'Aucun mouvement détecté entre les syncs.', en: 'No movements detected between syncs.' },
  'movements.added': { fr: 'Ajouté', en: 'Added' },
  'movements.removed': { fr: 'Retiré', en: 'Removed' },

  // ── Aggregated view ──
  'overview.allAccounts': { fr: 'Tous les comptes', en: 'All accounts' },
  'overview.allAccountsSubtitle': { fr: 'Vue agrégée de tous les comptes', en: 'Aggregated view across all accounts' },
  'dashboard.accountBreakdown': { fr: 'Répartition par compte', en: 'Breakdown by account' },

  // ── Settings sections ──
  'settings.sectionAppearance': { fr: 'Apparence', en: 'Appearance' },
  'settings.sectionPricing': { fr: 'Prix', en: 'Pricing' },
  'settings.sectionAutomation': { fr: 'Automatisation', en: 'Automation' },
  'settings.sectionData': { fr: 'Données', en: 'Data' },
  'settings.trackedSources': { fr: 'Sources suivies', en: 'Tracked sources' },
  'settings.trackedSourcesDesc': {
    fr: 'Sources récupérées par les prix automatiques. Coche au moins deux sources pour activer le comparateur.',
    en: 'Sources fetched by the automatic price refresh. Check at least two to enable the comparator.',
  },

  // ── Source comparator ──
  'nav.compare': { fr: 'Comparateur', en: 'Comparator' },
  'compare.title': { fr: 'Comparateur de sources', en: 'Source comparator' },
  'compare.caption': {
    fr: 'Dernier prix connu par source pour tes items. Écart calculé par rapport à la source primaire.',
    en: 'Latest known price per source for your items. Spread computed against the primary source.',
  },
  'compare.item': { fr: 'Item', en: 'Item' },
  'compare.spread': { fr: 'Écart', en: 'Spread' },
  'compare.none': { fr: 'Pas encore de prix multi-sources. Lance un refresh prix sur chaque source suivie.', en: 'No multi-source prices yet. Run a price refresh for each tracked source.' },
} as const;

export type TranslationKey = keyof typeof translations;

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  priceProvider: PriceProvider;
  setPriceProvider: (p: PriceProvider) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getInitialLocale(): Locale {
  const stored = localStorage.getItem('locale');
  if (stored === 'fr' || stored === 'en') return stored;
  return 'fr';
}

function getInitialPriceProvider(): PriceProvider {
  const stored = localStorage.getItem('priceProvider');
  if (stored === 'steam' || stored === 'steam_fees' || stored === 'csfloat' || stored === 'skinport') return stored;
  return 'steam';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const [priceProvider, setPriceProviderState] = useState<PriceProvider>(getInitialPriceProvider);

  // formatEur lives outside React (no context access), so sync its module-level
  // locale during render: a locale change re-renders all consumers in this same
  // pass, so they pick up the new format immediately. The assignment is idempotent.
  setFormatterLocale(locale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('locale', l);
  }, []);

  const setPriceProvider = useCallback((p: PriceProvider) => {
    setPriceProviderState(p);
    localStorage.setItem('priceProvider', p);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      const entry = translations[key];
      if (!entry) return key;
      return entry[locale] || entry.fr;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, priceProvider, setPriceProvider, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
