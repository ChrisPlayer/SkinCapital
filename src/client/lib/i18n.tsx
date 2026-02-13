import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Locale = 'fr' | 'en';

const translations = {
  // ── Auth ──
  'auth.steamAuth': { fr: 'STEAM_AUTH // CONNEXION', en: 'STEAM_AUTH // SECURE_LOGIN' },
  'auth.username': { fr: 'Nom d\'utilisateur Steam', en: 'Steam Username' },
  'auth.usernamePlaceholder': { fr: 'Votre nom d\'utilisateur Steam', en: 'Your Steam username' },
  'auth.password': { fr: 'Mot de passe', en: 'Password' },
  'auth.passwordPlaceholder': { fr: 'Votre mot de passe Steam', en: 'Your Steam password' },
  'auth.connecting': { fr: 'Connexion...', en: 'Connecting...' },
  'auth.login': { fr: 'Se connecter', en: 'Log in' },
  'auth.backToProfiles': { fr: 'Retour aux profils', en: 'Back to profiles' },
  'auth.steamGuardRequired': { fr: 'Code Steam Guard requis', en: 'Steam Guard code required' },
  'auth.enter2fa': { fr: 'SAISIR_CODE_2FA', en: 'ENTER_2FA_CODE' },
  'auth.validating': { fr: 'Validation...', en: 'Validating...' },
  'auth.validate': { fr: 'Valider', en: 'Validate' },

  // ── Profiles ──
  'profiles.addAccount': { fr: 'Ajouter un compte', en: 'Add account' },
  'profiles.yourProfiles': { fr: 'Vos profils', en: 'Your profiles' },
  'profiles.selectProfile': { fr: 'SELECTIONNER_PROFIL // MULTI_COMPTES', en: 'SELECT_PROFILE // MULTI_ACCOUNT' },
  'profiles.items': { fr: 'Items', en: 'Items' },
  'profiles.value': { fr: 'Valeur', en: 'Value' },
  'profiles.lastSync': { fr: 'DERNIER_SYNC', en: 'LAST_SYNC' },
  'profiles.neverSynced': { fr: 'JAMAIS_SYNCED', en: 'NEVER_SYNCED' },
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
  'nav.terminal': { fr: 'Terminal', en: 'Terminal' },
  'nav.account': { fr: 'Compte', en: 'Account' },
  'nav.profiles': { fr: 'Profils', en: 'Profiles' },
  'nav.logout': { fr: 'Deconnexion', en: 'Logout' },
  'nav.settings': { fr: 'Parametres', en: 'Settings' },

  // ── Dashboard header ──
  'dashboard.marketOverview': { fr: 'Vue d\'ensemble', en: 'Market Overview' },
  'dashboard.inventory': { fr: 'Inventaire', en: 'Inventory' },
  'dashboard.storageUnits': { fr: 'Storage Units', en: 'Storage Units' },
  'dashboard.allAssets': { fr: 'Tous les items', en: 'All Assets' },
  'dashboard.userSession': { fr: 'SESSION_UTILISATEUR', en: 'USER_SESSION' },
  'dashboard.syncing': { fr: 'Synchronisation', en: 'Syncing' },
  'dashboard.refreshPrices': { fr: 'Refresh Prix', en: 'Refresh Prices' },
  'dashboard.refreshPricesTooltip': { fr: 'Rafraichir les prix (sans connexion Steam)', en: 'Refresh prices (no Steam login needed)' },
  'dashboard.refreshInventory': { fr: 'Refresh Inventaire', en: 'Refresh Inventory' },
  'dashboard.refreshInventoryTooltip': { fr: 'Rafraichir l\'inventaire (necessite connexion Steam)', en: 'Refresh inventory (requires Steam login)' },
  'dashboard.priceWindowTooltip': { fr: 'Fenetre de mise a jour des prix', en: 'Price update window' },

  // ── Dashboard KPIs ──
  'dashboard.portfolioPerformance': { fr: 'PERFORMANCE_PORTFOLIO', en: 'PORTFOLIO_PERFORMANCE' },
  'dashboard.totalItems': { fr: 'Items Total', en: 'Total Items' },
  'dashboard.uniqueItems': { fr: 'Items Uniques', en: 'Unique Items' },
  'dashboard.var24h': { fr: 'Var. 24h', en: '24h Change' },
  'dashboard.netValuation': { fr: 'VALEUR_NETTE', en: 'NET_VALUATION' },
  'dashboard.noChartData': { fr: 'AUCUNE_DONNEE', en: 'NO_CHART_DATA' },
  'dashboard.topAssets': { fr: 'Top Items', en: 'Top Assets' },

  // ── Search & Sort ──
  'search.placeholder': { fr: 'Rechercher...', en: 'Search...' },
  'sort.price': { fr: 'Prix', en: 'Price' },
  'sort.name': { fr: 'Nom', en: 'Name' },
  'sort.float': { fr: 'Float', en: 'Float' },

  // ── Empty states ──
  'empty.noResults': { fr: 'AUCUN_RESULTAT', en: 'NO_RESULTS_FOUND' },
  'empty.noStorageUnits': { fr: 'AUCUNE_STORAGE_UNIT', en: 'NO_STORAGE_UNITS' },
  'empty.noItems': { fr: 'Aucun item trouve', en: 'No items found' },
  'empty.noStorageUnitsWithItems': { fr: 'Aucune Storage Unit avec des items', en: 'No Storage Units with items' },

  // ── Activity Feed ──
  'feed.system': { fr: 'Systeme', en: 'System' },
  'feed.nowSync': { fr: 'MAINTENANT // SYNC', en: 'NOW // SYNC' },
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
  'history.valuation': { fr: 'VALORISATION', en: 'VALUATION' },
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

  // ── View toggle ──
  'view.list': { fr: 'Liste', en: 'List' },
  'view.cards': { fr: 'Cartes', en: 'Cards' },

  // ── Inventory ──
  'inventory.includeStorage': { fr: 'Inclure Storage Units', en: 'Include Storage Units' },

  // ── Loading ──
  'loading.data': { fr: 'CHARGEMENT...', en: 'LOADING_DATA...' },
} as const;

export type TranslationKey = keyof typeof translations;

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getInitialLocale(): Locale {
  const stored = localStorage.getItem('locale');
  if (stored === 'fr' || stored === 'en') return stored;
  return 'fr';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('locale', l);
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
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
