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

  // ── Profiles ──
  'profiles.addAccount': { fr: 'Ajouter un compte', en: 'Add account' },
  'profiles.yourProfiles': { fr: 'Vos profils', en: 'Your profiles' },
  'profiles.selectProfile': { fr: 'Selectionne un profil', en: 'Select a profile' },
  'profiles.items': { fr: 'Items', en: 'Items' },
  'profiles.value': { fr: 'Valeur', en: 'Value' },
  'profiles.lastSync': { fr: 'Derniere synchronisation', en: 'Last sync' },
  'profiles.neverSynced': { fr: 'Jamais synchronise', en: 'Never synced' },
  'profiles.noProfiles': { fr: 'Aucun profil', en: 'No profiles' },
  'profiles.noProfilesDesc': {
    fr: 'Connectez-vous avec votre compte Steam pour commencer le suivi de votre inventaire CS2.',
    en: 'Log in with your Steam account to start tracking your CS2 inventory.',
  },

  // ── Dashboard nav ──
  'nav.dashboard': { fr: 'Dashboard', en: 'Dashboard' },
  'nav.inventory': { fr: 'Inventaire', en: 'Inventory' },
  'nav.storageUnits': { fr: 'Storage Units', en: 'Storage Units' },
  'nav.terminal': { fr: 'Navigation', en: 'Navigation' },
  'nav.account': { fr: 'Compte', en: 'Account' },
  'nav.profiles': { fr: 'Profils', en: 'Profiles' },
  'nav.logout': { fr: 'Deconnexion', en: 'Logout' },
  'nav.settings': { fr: 'Parametres', en: 'Settings' },

  // ── Dashboard header ──
  'dashboard.marketOverview': { fr: 'Vue d\'ensemble', en: 'Market Overview' },
  'dashboard.inventory': { fr: 'Inventaire', en: 'Inventory' },
  'dashboard.storageUnits': { fr: 'Storage Units', en: 'Storage Units' },
  'dashboard.syncing': { fr: 'Synchronisation', en: 'Syncing' },
  'dashboard.refreshPrices': { fr: 'Refresh Prix', en: 'Refresh Prices' },
  'dashboard.refreshPricesTooltip': { fr: 'Rafraichir les prix (sans connexion Steam)', en: 'Refresh prices (no Steam login needed)' },
  'dashboard.refreshInventory': { fr: 'Refresh Inventaire', en: 'Refresh Inventory' },
  'dashboard.refreshInventoryTooltip': { fr: 'Rafraichir l\'inventaire (necessite connexion Steam)', en: 'Refresh inventory (requires Steam login)' },
  'dashboard.priceWindowTooltip': { fr: 'Fenetre de mise a jour des prix', en: 'Price update window' },

  // ── Dashboard KPIs ──
  'dashboard.portfolioPerformance': { fr: 'Performance du portefeuille', en: 'Portfolio performance' },
  'dashboard.itemsLabel': { fr: 'items', en: 'items' },
  'dashboard.uniqueLabel': { fr: 'uniques', en: 'unique' },
  'dashboard.netValuation': { fr: 'Valeur nette', en: 'Net valuation' },
  'dashboard.noChartData': { fr: 'Aucune donnee', en: 'No chart data' },
  'dashboard.topAssets': { fr: 'Top Items', en: 'Top Assets' },
  'dashboard.invested': { fr: 'Investi', en: 'Invested' },

  // ── Search & Sort ──
  'search.placeholder': { fr: 'Rechercher...', en: 'Search...' },
  'search.label': { fr: 'Rechercher', en: 'Search' },
  'sort.price': { fr: 'Prix', en: 'Price' },
  'sort.name': { fr: 'Nom', en: 'Name' },
  'sort.float': { fr: 'Float', en: 'Float' },
  'sort.quantity': { fr: 'Quantite', en: 'Quantity' },
  'sort.by': { fr: 'Trier par', en: 'Sort by' },
  'sort.value': { fr: 'Valeur', en: 'Value' },
  'sort.itemCount': { fr: 'Nombre d\'items', en: 'Item count' },

  // ── Filters ──
  'filter.rarity': { fr: 'Rarete', en: 'Rarity' },
  'filter.type': { fr: 'Type', en: 'Type' },
  'filter.quality': { fr: 'Qualite', en: 'Quality' },
  'filter.all': { fr: 'Tous', en: 'All' },
  'filter.normal': { fr: 'Normal', en: 'Normal' },
  'filter.withStickers': { fr: 'Avec stickers', en: 'With stickers' },
  'filter.reset': { fr: 'Reinitialiser', en: 'Reset' },
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

  // ── Portfolio composition ──
  'portfolio.composition': { fr: 'Repartition du portefeuille', en: 'Portfolio breakdown' },

  // ── Top movers ──
  'movers.title': { fr: 'Top variations', en: 'Top movers' },
  'movers.gainers': { fr: 'Hausses', en: 'Gainers' },
  'movers.losers': { fr: 'Baisses', en: 'Losers' },
  'movers.none': { fr: 'Pas assez de donnees', en: 'Not enough data' },

  // ── Pagination ──
  'pagination.prevPage': { fr: 'Page precedente', en: 'Previous page' },
  'pagination.nextPage': { fr: 'Page suivante', en: 'Next page' },

  // ── Empty states ──
  'empty.noResults': { fr: 'Aucun resultat', en: 'No results found' },
  'empty.noResultsDesc': { fr: 'Essaie d\'ajuster la recherche ou les filtres.', en: 'Try adjusting your search or filters.' },
  'empty.noStorageUnits': { fr: 'Aucune storage unit', en: 'No storage units' },
  'empty.noStorageUnitsDesc': { fr: 'Les storage units apparaitront ici apres un refresh de l\'inventaire.', en: 'Storage units will appear here after an inventory refresh.' },
  'empty.moversDesc': { fr: 'Les variations de prix apparaitront ici apres quelques jours de donnees.', en: 'Price changes will show up here after a few days of data.' },

  // ── Activity Feed ──
  'feed.activity': { fr: 'Activite', en: 'Activity' },
  'feed.showPanel': { fr: 'Afficher le panneau', en: 'Show panel' },
  'feed.system': { fr: 'Systeme', en: 'System' },
  'feed.syncingTitle': { fr: 'Synchronisation...', en: 'Syncing...' },
  'feed.syncingDesc': { fr: 'Rafraichissement de l\'inventaire en cours. Les prix sont mis a jour...', en: 'Inventory refresh in progress. Prices are being fetched...' },
  'feed.syncComplete': { fr: 'Sync terminee', en: 'Sync Complete' },
  'feed.itemsSynced': { fr: 'items synchronises', en: 'items synced' },
  'feed.showAll': { fr: 'Voir tout', en: 'Show all' },
  'feed.showLess': { fr: 'Voir moins', en: 'Show less' },

  // ── Price Alerts ──
  'alerts.title': { fr: 'Alertes Prix', en: 'Price Alerts' },
  'alerts.priceUp': { fr: 'Prix en hausse', en: 'Price increase' },
  'alerts.priceDown': { fr: 'Prix en baisse', en: 'Price decrease' },
  'alerts.moderateUp': { fr: 'Hausse moderee', en: 'Moderate increase' },
  'alerts.moderateDown': { fr: 'Baisse moderee', en: 'Moderate decrease' },
  'alerts.noAlerts': { fr: 'Aucune alerte', en: 'No alerts' },
  'alerts.custom': { fr: 'Alertes personnalisees', en: 'Custom alerts' },
  'alerts.create': { fr: 'Creer', en: 'Create' },
  'alerts.triggered': { fr: 'Declenchee', en: 'Triggered' },
  'alerts.none': { fr: 'Aucune alerte personnalisee', en: 'No custom alerts' },
  'alerts.priceAlert': { fr: 'Alerte prix', en: 'Price alert' },

  // ── Daily History ──
  'history.title': { fr: 'Historique Journalier', en: 'Daily History' },
  'history.noHistory': { fr: 'Aucun historique', en: 'No History' },

  // ── Item Detail Modal ──
  'item.stickers': { fr: 'Stickers', en: 'Stickers' },
  'item.priceError': { fr: 'Impossible de charger les prix', en: 'Failed to load prices' },
  'item.priceHistory': { fr: 'Historique 30j', en: '30d history' },
  'item.buyPrice': { fr: 'Prix d\'achat', en: 'Buy price' },
  'item.pnl': { fr: 'P&L', en: 'P&L' },
  'item.save': { fr: 'Enregistrer', en: 'Save' },
  'item.clear': { fr: 'Effacer', en: 'Clear' },

  // ── Settings ──
  'settings.title': { fr: 'Parametres', en: 'Settings' },
  'settings.language': { fr: 'Langue', en: 'Language' },
  'settings.french': { fr: 'Francais', en: 'French' },
  'settings.english': { fr: 'Anglais', en: 'English' },
  'settings.back': { fr: 'Retour', en: 'Back' },
  'settings.priceProvider': { fr: 'Source des prix', en: 'Price source' },
  'settings.steam': { fr: 'Steam Market', en: 'Steam Market' },
  'settings.csfloat': { fr: 'CSFloat', en: 'CSFloat' },
  'settings.skinport': { fr: 'Skinport', en: 'Skinport' },
  'settings.steamFees': { fr: 'Steam (- frais)', en: 'Steam (- fees)' },
  'settings.steamFeesDesc': { fr: 'Steam (- frais) applique les frais Steam/CS2. CSFloat est une source separee.', en: 'Steam (- fees) applies Steam/CS2 seller fees. CSFloat is a separate source.' },
  'settings.pricingMethod': { fr: 'Methode de recuperation des prix', en: 'Price fetch method' },
  'settings.pricingMethodDesc': { fr: 'Avec proxies = rapide. Sans = connexion directe, plus lente mais complete et jamais bloquee par Steam.', en: 'With proxies = fast. Without = direct connection, slower but complete and never rate-limited by Steam.' },
  'settings.modeAuto': { fr: 'Auto', en: 'Auto' },
  'settings.modeProxy': { fr: 'Proxies (rapide)', en: 'Proxies (fast)' },
  'settings.modeDirect': { fr: 'Direct (lent)', en: 'Direct (slow)' },
  'settings.modeAutoHint': { fr: 'Auto : utilise les proxies si renseignes, sinon direct.', en: 'Auto: uses proxies if set, otherwise direct.' },
  'settings.proxiesHint': { fr: 'Formats acceptes : host:port:user:pass ou http://user:pass@host:port. Une seule gateway rotative suffit.', en: 'Accepted: host:port:user:pass or http://user:pass@host:port. A single rotating gateway is enough.' },
  'settings.save': { fr: 'Enregistrer', en: 'Save' },
  'settings.saved': { fr: 'Enregistre', en: 'Saved' },
  'settings.activeMode': { fr: 'Mode actif', en: 'Active mode' },
  'settings.proxiesCurrent': { fr: 'Proxies actuels', en: 'Current proxies' },
  'settings.proxiesNone': { fr: 'Aucun (mode direct)', en: 'None (direct mode)' },
  'settings.proxiesNew': { fr: 'Nouveaux proxies (laisser vide = conserver)', en: 'New proxies (leave blank to keep)' },
  'settings.test': { fr: 'Tester', en: 'Test' },
  'settings.testing': { fr: 'Test...', en: 'Testing...' },
  'settings.reset': { fr: 'Reinitialiser (.env)', en: 'Reset (.env)' },
  'settings.accent': { fr: 'Couleur d\'accent', en: 'Accent color' },
  'settings.autoPrices': { fr: 'Prix automatiques', en: 'Automatic prices' },
  'settings.autoPricesDesc': {
    fr: 'Recharge chaque jour les prix des items deja en base, a l\'heure choisie — sans connexion Steam. Les nouveaux items demandent une connexion + refresh inventaire.',
    en: 'Reloads prices for items already in the database every day at the chosen time — no Steam login involved. New items require logging in + an inventory refresh.',
  },
  'settings.autoPricesOn': { fr: 'Active', en: 'Enabled' },
  'settings.autoPricesOff': { fr: 'Desactive', en: 'Disabled' },
  'settings.runNow': { fr: 'Lancer maintenant', en: 'Run now' },
  'toast.scheduleSaved': { fr: 'Planification enregistree', en: 'Schedule saved' },
  'toast.runStarted': { fr: 'Rechargement des prix lance', en: 'Price reload started' },
  'toast.runAlready': { fr: 'Un rechargement est deja en cours', en: 'A reload is already running' },

  // ── Toasts ──
  'toast.settingsSaved': { fr: 'Parametres enregistres', en: 'Settings saved' },
  'toast.settingsReset': { fr: 'Parametres reinitialises', en: 'Settings reset' },
  'toast.proxyOk': { fr: 'Proxy OK', en: 'Proxy OK' },
  'toast.proxyFail': { fr: 'Echec du test proxy', en: 'Proxy test failed' },
  'toast.buyPriceSaved': { fr: 'Prix d\'achat enregistre', en: 'Buy price saved' },
  'toast.buyPriceCleared': { fr: 'Prix d\'achat efface', en: 'Buy price cleared' },
  'toast.alertCreated': { fr: 'Alerte creee', en: 'Alert created' },
  'toast.alertDeleted': { fr: 'Alerte supprimee', en: 'Alert deleted' },
  'toast.refreshError': { fr: 'Echec du rafraichissement', en: 'Refresh failed' },

  // ── Login teaser ──
  'login.teaser': { fr: 'Reprends ton suivi', en: 'Pick up where you left off' },

  // ── View toggle ──
  'view.list': { fr: 'Liste', en: 'List' },
  'view.cards': { fr: 'Cartes', en: 'Cards' },
  'view.compact': { fr: 'Compact', en: 'Compact' },

  // ── Inventory ──
  'inventory.includeStorage': { fr: 'Inclure Storage Units', en: 'Include Storage Units' },
  'storage.emptyUnits': { fr: 'Storage Units vides', en: 'Empty Storage Units' },
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
