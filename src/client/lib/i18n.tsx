import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Locale = 'fr' | 'en';
export type PriceProvider = 'steam' | 'steam_fees' | 'csfloat';

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
  'nav.allAssets': { fr: 'Tous les items', en: 'All Assets' },
  'nav.terminal': { fr: 'Navigation', en: 'Navigation' },
  'nav.account': { fr: 'Compte', en: 'Account' },
  'nav.profiles': { fr: 'Profils', en: 'Profiles' },
  'nav.logout': { fr: 'Deconnexion', en: 'Logout' },
  'nav.settings': { fr: 'Parametres', en: 'Settings' },

  // ── Dashboard header ──
  'dashboard.marketOverview': { fr: 'Vue d\'ensemble', en: 'Market Overview' },
  'dashboard.inventory': { fr: 'Inventaire', en: 'Inventory' },
  'dashboard.storageUnits': { fr: 'Storage Units', en: 'Storage Units' },
  'dashboard.allAssets': { fr: 'Tous les items', en: 'All Assets' },
  'dashboard.userSession': { fr: 'Session utilisateur', en: 'User session' },
  'dashboard.syncing': { fr: 'Synchronisation', en: 'Syncing' },
  'dashboard.refreshPrices': { fr: 'Refresh Prix', en: 'Refresh Prices' },
  'dashboard.refreshPricesTooltip': { fr: 'Rafraichir les prix (sans connexion Steam)', en: 'Refresh prices (no Steam login needed)' },
  'dashboard.refreshInventory': { fr: 'Refresh Inventaire', en: 'Refresh Inventory' },
  'dashboard.refreshInventoryTooltip': { fr: 'Rafraichir l\'inventaire (necessite connexion Steam)', en: 'Refresh inventory (requires Steam login)' },
  'dashboard.priceWindowTooltip': { fr: 'Fenetre de mise a jour des prix', en: 'Price update window' },

  // ── Dashboard KPIs ──
  'dashboard.portfolioPerformance': { fr: 'Performance du portefeuille', en: 'Portfolio performance' },
  'dashboard.totalItems': { fr: 'Items Total', en: 'Total Items' },
  'dashboard.uniqueItems': { fr: 'Items Uniques', en: 'Unique Items' },
  'dashboard.var24h': { fr: 'Var. 24h', en: '24h Change' },
  'dashboard.netValuation': { fr: 'Valeur nette', en: 'Net valuation' },
  'dashboard.noChartData': { fr: 'Aucune donnee', en: 'No chart data' },
  'dashboard.topAssets': { fr: 'Top Items', en: 'Top Assets' },
  'dashboard.missingPricesTitle': { fr: 'Prix manquants detectes', en: 'Missing prices detected' },
  'dashboard.missingPricesAction': { fr: 'Completer les prix', en: 'Fetch missing prices' },

  // ── Search & Sort ──
  'search.placeholder': { fr: 'Rechercher...', en: 'Search...' },
  'sort.price': { fr: 'Prix', en: 'Price' },
  'sort.name': { fr: 'Nom', en: 'Name' },
  'sort.float': { fr: 'Float', en: 'Float' },
  'sort.quantity': { fr: 'Quantite', en: 'Quantity' },
  'sort.by': { fr: 'Trier par', en: 'Sort by' },

  // ── Empty states ──
  'empty.noResults': { fr: 'Aucun resultat', en: 'No results found' },
  'empty.noStorageUnits': { fr: 'Aucune storage unit', en: 'No storage units' },
  'empty.noItems': { fr: 'Aucun item trouve', en: 'No items found' },
  'empty.noStorageUnitsWithItems': { fr: 'Aucune Storage Unit avec des items', en: 'No Storage Units with items' },

  // ── Activity Feed ──
  'feed.system': { fr: 'Systeme', en: 'System' },
  'feed.nowSync': { fr: 'Synchronisation en cours', en: 'Sync in progress' },
  'feed.syncingTitle': { fr: 'Synchronisation...', en: 'Syncing...' },
  'feed.syncingDesc': { fr: 'Rafraichissement de l\'inventaire en cours. Les prix sont mis a jour...', en: 'Inventory refresh in progress. Prices are being fetched...' },
  'feed.syncComplete': { fr: 'Sync terminee', en: 'Sync Complete' },
  'feed.itemsSynced': { fr: 'items synchronises', en: 'items synced' },
  'feed.portfolio': { fr: 'Portfolio', en: 'Portfolio' },

  // ── Price Alerts ──
  'alerts.title': { fr: 'Alertes Prix', en: 'Price Alerts' },
  'alerts.priceUp': { fr: 'Prix en hausse', en: 'Price increase' },
  'alerts.priceDown': { fr: 'Prix en baisse', en: 'Price decrease' },
  'alerts.moderateUp': { fr: 'Hausse moderee', en: 'Moderate increase' },
  'alerts.moderateDown': { fr: 'Baisse moderee', en: 'Moderate decrease' },
  'alerts.noAlerts': { fr: 'Aucune alerte', en: 'No alerts' },
  'alerts.noAlertsDesc': { fr: 'Aucun changement de prix significatif detecte.', en: 'No significant price changes detected.' },

  // ── Daily History ──
  'history.title': { fr: 'Historique Journalier', en: 'Daily History' },
  'history.valuation': { fr: 'Valorisation', en: 'Valuation' },
  'history.noChange': { fr: 'Aucun changement', en: 'No change' },
  'history.noHistory': { fr: 'Aucun historique', en: 'No History' },
  'history.noHistoryDesc': { fr: 'Aucune donnee historique enregistree.', en: 'No historical data recorded.' },

  // ── Item Detail Modal ──
  'item.steamPrice': { fr: 'Prix Steam', en: 'Steam Price' },
  'item.var24h': { fr: 'Var. 24h', en: '24h Change' },
  'item.stickers': { fr: 'Stickers', en: 'Stickers' },

  // ── KPI Cards (unused components but translating anyway) ──
  'kpi.totalValue': { fr: 'Valeur Totale', en: 'Total Value' },
  'kpi.steamMarket': { fr: 'Steam Market', en: 'Steam Market' },
  'kpi.evolution24h': { fr: 'Evolution 24h', en: '24h Evolution' },
  'kpi.noData': { fr: 'Pas de donnees', en: 'No data' },
  'kpi.uniques': { fr: 'uniques', en: 'unique' },
  'kpi.storedItems': { fr: 'items stockes', en: 'items stored' },

  // ── Value Chart ──
  'chart.valueHistory': { fr: 'Historique de valeur', en: 'Value History' },
  'chart.value': { fr: 'Valeur', en: 'Value' },
  'chart.noData': { fr: 'Pas encore de donnees historiques', en: 'No historical data yet' },

  // ── Daily History Table ──
  'table.date': { fr: 'Date', en: 'Date' },
  'table.totalValue': { fr: 'Valeur Totale', en: 'Total Value' },
  'table.variation': { fr: 'Variation', en: 'Variation' },
  'table.noHistoryData': { fr: 'Aucune donnee historique disponible', en: 'No historical data available' },

  // ── Export ──
  'export.csv': { fr: 'Exporter CSV', en: 'Export CSV' },

  // ── Settings ──
  'settings.title': { fr: 'Parametres', en: 'Settings' },
  'settings.language': { fr: 'Langue', en: 'Language' },
  'settings.french': { fr: 'Francais', en: 'French' },
  'settings.english': { fr: 'Anglais', en: 'English' },
  'settings.back': { fr: 'Retour', en: 'Back' },
  'settings.priceProvider': { fr: 'Source des prix', en: 'Price source' },
  'settings.steam': { fr: 'Steam Market', en: 'Steam Market' },
  'settings.csfloat': { fr: 'CSFloat', en: 'CSFloat' },
  'settings.steamFees': { fr: 'Steam (- frais)', en: 'Steam (- fees)' },
  'settings.steamFeesDesc': { fr: 'Steam (- frais) applique les frais Steam/CS2. CSFloat est une source separee.', en: 'Steam (- fees) applies Steam/CS2 seller fees. CSFloat is a separate source.' },

  // ── View toggle ──
  'view.list': { fr: 'Liste', en: 'List' },
  'view.cards': { fr: 'Cartes', en: 'Cards' },

  // ── Inventory ──
  'inventory.includeStorage': { fr: 'Inclure Storage Units', en: 'Include Storage Units' },
  'storage.emptyUnits': { fr: 'Storage Units vides', en: 'Empty Storage Units' },

  // ── Loading ──
  'loading.data': { fr: 'Chargement...', en: 'Loading...' },
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
  if (stored === 'steam' || stored === 'steam_fees' || stored === 'csfloat') return stored;
  return 'steam';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const [priceProvider, setPriceProviderState] = useState<PriceProvider>(getInitialPriceProvider);

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
