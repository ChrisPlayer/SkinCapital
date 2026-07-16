import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import {
  useDashboardData,
  useRefreshInventory,
  useRefreshPrices,
  useCancelPriceRefresh,
  useTrackedSources,
} from '../../hooks/useApi.ts';
import { useRefreshPolling } from '../../hooks/usePolling.ts';
import { useI18n } from '../../lib/i18n.tsx';
import { formatEur } from '../../lib/formatters.ts';
import { getDisplayItemName } from '../../lib/item-display.ts';
import { detectPatterns } from '../../../shared/lib/patterns.ts';
import { itemCategory, CATEGORY_ORDER, type ItemCategoryId } from '../../../shared/lib/item-names.ts';
import { ItemDetailModal } from '../inventory/ItemDetailModal.tsx';
import { ItemCard } from '../inventory/ItemCard.tsx';
import { useToast } from '../../components/toast.tsx';
import { GhostIconButton } from '../../components/controls.tsx';
import { AccountStatus } from '../../components/AccountStatus.tsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { useCountUp } from '../../hooks/useCountUp.ts';
import {
  LayoutDashboard, Package, FolderOpen, Search, Activity, Scale,
  ChevronLeft, ChevronRight, LayoutGrid, List, X, AlignJustify,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import type { ItemGroup } from '../../../shared/types/inventory.ts';
import { isAllProfiles } from '../../../shared/constants/profiles.ts';
import {
  REDUCED_MOTION, SECTION_TITLE, CATEGORY_LABEL_KEYS, COUNT_FORMATTERS,
} from './dashboard-lib.ts';
import type { View } from './shared.ts';
import { Sidebar, type NavItem } from './Sidebar.tsx';
import { MobileNav } from './MobileNav.tsx';
import { DashboardHeader } from './DashboardHeader.tsx';
import { ActivityView } from './ActivityView.tsx';
import { CompareView } from './CompareView.tsx';
import { AccountBreakdown } from './AccountBreakdown.tsx';
import { DashboardSkeleton } from './DashboardSkeleton.tsx';
import { HeroChart } from './HeroChart.tsx';
import { PortfolioComposition } from './PortfolioComposition.tsx';
import { TopMovers, MarketTrends } from './MoversCard.tsx';
import { AssetRow } from './AssetRow.tsx';
import { StorageSection } from './StorageSection.tsx';

type QualityFilter = '' | 'stattrak' | 'souvenir' | 'normal';

function formatPriceWindow(pw: { from: string; to: string }, locale: string): string {
  const loc = locale === 'fr' ? 'fr-FR' : 'en-GB';
  const from = new Date(pw.from + (pw.from.includes('Z') ? '' : 'Z'));
  const to = new Date(pw.to + (pw.to.includes('Z') ? '' : 'Z'));
  const datePart = to.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
  const fromTime = from.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  const toTime = to.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (fromTime === toTime) return `${datePart} ${fromTime}`;
  return `${datePart} ${fromTime}–${toTime}`;
}

const PER_PAGE = 30;

type SortMode = 'price' | 'name' | 'float' | 'quantity';

// Natural direction per sort mode: value-like sorts start high-to-low, while
// name/float start low-to-high. The toggle flips relative to this default.
const SORT_DEFAULT_DIR: Record<SortMode, 'asc' | 'desc'> = {
  price: 'desc',
  quantity: 'desc',
  name: 'asc',
  float: 'asc',
};

// ── Main Component ──

export function DashboardPage() {
  const { steamId } = useParams<{ steamId: string }>();
  const navigate = useNavigate();
  const { status, logout } = useAuth();
  const { t, locale, priceProvider } = useI18n();
  const pp = priceProvider;
  const priceSource: 'steam' | 'csfloat' | 'skinport' =
    priceProvider === 'csfloat' ? 'csfloat' : priceProvider === 'skinport' ? 'skinport' : 'steam';
  // Filters/view live in the URL (shareable, survives reloads): read once as
  // initial state, then written back below — defaults are omitted from the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<View>(() => {
    const v = searchParams.get('view');
    return v === 'inventory' || v === 'storage' || v === 'activity' || v === 'compare' ? v : 'dashboard';
  });
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [sort, setSort] = useState<SortMode>(() => {
    const s = searchParams.get('sort');
    return s === 'name' || s === 'float' || s === 'quantity' ? s : 'price';
  });
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    const d = searchParams.get('dir');
    if (d === 'asc' || d === 'desc') return d;
    const s = searchParams.get('sort');
    return SORT_DEFAULT_DIR[s === 'name' || s === 'float' || s === 'quantity' ? s : 'price'];
  });
  const [rarityFilter, setRarityFilter] = useState(() => searchParams.get('rarity') ?? '');
  const [typeFilter, setTypeFilter] = useState(() => searchParams.get('type') ?? '');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>(() => {
    const q = searchParams.get('quality');
    return q === 'stattrak' || q === 'souvenir' || q === 'normal' ? q : '';
  });
  const [stickeredOnly, setStickeredOnly] = useState(() => searchParams.get('stickers') === '1');
  const [notablePatternsOnly, setNotablePatternsOnly] = useState(() => searchParams.get('patterns') === '1');
  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1));
  const [selectedItem, setSelectedItem] = useState<ItemGroup | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(
    () => (localStorage.getItem('inventoryViewMode') === 'cards' ? 'cards' : 'list'),
  );
  const [compact, setCompact] = useState(() => localStorage.getItem('inventoryDensity') === 'compact');
  const [includeStorage, setIncludeStorage] = useState(() => searchParams.get('storage') === '1');
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [storageSort, setStorageSort] = useState<'value' | 'name' | 'count'>('value');
  const toast = useToast();
  const mainRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== 'dashboard') params.set('view', view);
    if (search) params.set('q', search);
    if (sort !== 'price') params.set('sort', sort);
    if (sortDir !== SORT_DEFAULT_DIR[sort]) params.set('dir', sortDir);
    if (rarityFilter) params.set('rarity', rarityFilter);
    if (typeFilter) params.set('type', typeFilter);
    if (qualityFilter) params.set('quality', qualityFilter);
    if (stickeredOnly) params.set('stickers', '1');
    if (notablePatternsOnly) params.set('patterns', '1');
    if (includeStorage) params.set('storage', '1');
    if (page > 1) params.set('page', String(page));
    setSearchParams(params, { replace: true });
  }, [view, search, sort, sortDir, rarityFilter, typeFilter, qualityFilter, stickeredOnly, notablePatternsOnly, includeStorage, page, setSearchParams]);

  // Page changes land the user mid-list otherwise: bring the scrollable main
  // container back to the top (instant for reduced-motion users).
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
  }, [page]);

  // `/` focuses the search from anywhere on the page (inventory view only),
  // unless the user is already typing in a field.
  useEffect(() => {
    if (view !== 'inventory') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [view]);

  const toggleCompact = () => {
    setCompact((prev) => {
      const next = !prev;
      localStorage.setItem('inventoryDensity', next ? 'compact' : 'comfortable');
      return next;
    });
  };
  const changeViewMode = (mode: 'list' | 'cards') => {
    setViewMode(mode);
    localStorage.setItem('inventoryViewMode', mode);
  };
  // Refresh-outcome toasts (anti-wipe aborts, errors) come from useEventToasts,
  // mounted once at App level — no per-page onComplete wiring needed here.
  const { isRefreshing, syncType, source: activeRefreshSource, lastRefresh, progress, steam } = useRefreshPolling(
    steamId,
    priceSource,
  );
  const { data, isError, refetch } = useDashboardData(steamId!, days, priceSource, isRefreshing);
  const refreshMutation = useRefreshInventory();
  const refreshPricesMutation = useRefreshPrices();
  const cancelPriceRefreshMutation = useCancelPriceRefresh();

  const isAggregate = isAllProfiles(steamId);
  const isOwner = !!status?.isLoggedIn && status?.steamId === steamId;

  // Comparator tab only exists once 2+ price sources are tracked (Settings).
  const { data: trackedSourcesData } = useTrackedSources();
  const trackedSources = trackedSourcesData?.sources ?? ['steam'];
  const showCompare = trackedSources.length >= 2;

  // Tab title doubles as a live ticker: portfolio value, ⟳ prefix while a
  // refresh runs. Computed at render time so formatEur picks up locale changes.
  const docTitle = data ? `${isRefreshing ? '⟳ ' : ''}${formatEur(data.totalValue, pp)} — SkinCapital` : null;
  useEffect(() => {
    if (docTitle !== null) document.title = docTitle;
  }, [docTitle]);
  useEffect(() => () => { document.title = 'SkinCapital'; }, []);

  const baseItems = useMemo(() => {
    if (!data) return [] as ItemGroup[];
    return includeStorage ? data.items : data.mainInventory.items;
  }, [data, includeStorage]);

  const rarityOptions = useMemo(() => {
    const names = new Set<string>();
    for (const i of baseItems) names.add(i.rarity.name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [baseItems]);

  const typeOptions = useMemo(() => {
    const present = new Set<ItemCategoryId>();
    for (const i of baseItems) present.add(itemCategory(i.marketHashName));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [baseItems]);

  // Look the selected item up in the freshest dashboard data so the modal
  // reflects mutations (e.g. a saved buy price) without being reopened.
  const liveSelectedItem = useMemo(() => {
    if (!selectedItem || !data) return selectedItem;
    return data.items.find((i) => i.marketHashName === selectedItem.marketHashName) ?? selectedItem;
  }, [selectedItem, data]);

  const filtered = useMemo(() => {
    if (view !== 'inventory') return [] as ItemGroup[];
    let r = baseItems;
    if (search) { const q = search.toLowerCase(); r = r.filter((i) => i.marketHashName.toLowerCase().includes(q)); }
    if (rarityFilter) r = r.filter((i) => i.rarity.name === rarityFilter);
    if (typeFilter) r = r.filter((i) => itemCategory(i.marketHashName) === typeFilter);
    if (qualityFilter) r = r.filter((i) => (qualityFilter === 'normal' ? i.quality === null : i.quality === qualityFilter));
    if (stickeredOnly) r = r.filter((i) => i.stickers.length > 0);
    if (notablePatternsOnly) {
      r = r.filter((i) => detectPatterns({ marketHashName: i.marketHashName, floatValue: i.floatValue, paintSeed: i.paintSeed }).length > 0);
    }
    // Comparators are written ascending; the direction multiplier flips them.
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sort === 'name') {
      r = [...r].sort((a, b) => {
        const aName = getDisplayItemName(a.marketHashName, a.wear?.name);
        const bName = getDisplayItemName(b.marketHashName, b.wear?.name);
        return dir * aName.localeCompare(bName);
      });
    }
    else if (sort === 'quantity') r = [...r].sort((a, b) => dir * (a.quantity - b.quantity || a.total - b.total));
    else if (sort === 'float') r = [...r].sort((a, b) => dir * ((a.floatValue ?? 1) - (b.floatValue ?? 1)));
    else r = [...r].sort((a, b) => dir * (a.total - b.total));
    return r;
  }, [baseItems, view, search, sort, sortDir, rarityFilter, typeFilter, qualityFilter, stickeredOnly, notablePatternsOnly]);

  // Storage units sorted per the storage-view selector (value desc by default).
  const sortedStorageUnits = useMemo(() => {
    const units = data?.storageUnits ?? [];
    if (storageSort === 'name') return [...units].sort((a, b) => a.name.localeCompare(b.name));
    if (storageSort === 'count') return [...units].sort((a, b) => b.itemCount - a.itemCount);
    return [...units].sort((a, b) => b.totalValue - a.totalValue);
  }, [data, storageSort]);
  const maxStorageValue = useMemo(
    () => sortedStorageUnits.reduce((mx, u) => Math.max(mx, u.totalValue), 0),
    [sortedStorageUnits],
  );

  // Animated ticker for the sidebar valuation (HeroChart runs its own instance).
  const animatedTotal = useCountUp(data?.totalValue ?? 0);

  // Stable handler identities (useCallback + stable react-query mutate) so
  // memoized children don't re-render on unrelated dashboard state changes.
  const { mutate: mutateRefreshPrices } = refreshPricesMutation;
  const { mutate: mutateCancelPriceRefresh } = cancelPriceRefreshMutation;
  const handleRefreshPrices = useCallback(() => {
    if (steamId) {
      mutateRefreshPrices(
        { steamId, source: priceSource, scope: 'stale_or_missing' },
        { onError: (err) => toast.error((err as Error).message || t('toast.refreshError')) },
      );
    }
  }, [steamId, priceSource, mutateRefreshPrices, toast, t]);
  const handleCancelPriceRefresh = useCallback(() => {
    if (steamId) {
      mutateCancelPriceRefresh(steamId, {
        onError: (err) => toast.error((err as Error).message || t('toast.refreshError')),
      });
    }
  }, [steamId, mutateCancelPriceRefresh, toast, t]);

  if (!steamId) return <Navigate to="/" replace />;

  if (isError && !data) {
    return (
      <div className="h-screen h-dvh flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-400 mb-4">{t('dashboard.loadError')}</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-sf-cyan/10 text-sf-cyan text-sm hover:bg-sf-cyan/20"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  // With placeholderData on the dashboard query, `data` stays populated across
  // days/source key changes — the full skeleton is strictly first-load-only.
  if (!data) {
    return <DashboardSkeleton />;
  }

  const formatCount = (value: number) => COUNT_FORMATTERS[locale].format(value);
  const totalStorageUnits = data.storageUnits.length + data.emptyStorageUnits;

  const navItems: NavItem[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { id: 'inventory', icon: Package, label: `${t('nav.inventory')} (${formatCount(data.totalItems)})` },
    { id: 'storage', icon: FolderOpen, label: `${t('nav.storageUnits')} (${formatCount(totalStorageUnits)})` },
    { id: 'activity', icon: Activity, label: t('nav.activity') },
    ...(showCompare ? [{ id: 'compare' as const, icon: Scale, label: t('nav.compare') }] : []),
  ];

  const resetFilters = () => {
    setSearch('');
    setRarityFilter('');
    setTypeFilter('');
    setQualityFilter('');
    setStickeredOnly(false);
    setNotablePatternsOnly(false);
    setPage(1);
  };

  // Tab switches go through the View Transitions API on Chromium (cross-fade);
  // graceful no-op everywhere else and for reduced-motion users. Filters are
  // deliberately kept: they live in the URL and must survive tab round-trips.
  const switchView = (v: View) => {
    if (v === view) return;
    const applyView = () => setView(v);
    const startViewTransition = (document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    }).startViewTransition;
    if (REDUCED_MOTION || typeof startViewTransition !== 'function') {
      applyView();
      return;
    }
    startViewTransition.call(document, () => { flushSync(applyView); });
  };

  const hasActiveFilters = search !== '' || rarityFilter !== '' || typeFilter !== '' || qualityFilter !== '' || stickeredOnly || notablePatternsOnly;

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  // Clamp so a shrunken list (search/sort/storage toggle) never shows an empty page.
  const safePage = Math.min(page, Math.max(1, totalPages));
  const paginated = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  const inventoryTotal = includeStorage ? data.totalValue : data.mainInventory.total;

  const handleRefreshInventory = () => {
    if (!isOwner) { navigate('/login'); return; }
    // No credentials are stored, so a refresh needs a live Steam session. If it's
    // gone (logged off after the previous fetch), send the user to re-login.
    refreshMutation.mutate(undefined, {
      onError: (err) => {
        const message = (err as Error).message;
        toast.error(message || t('toast.refreshError'));
        if (/active steam session|authenticated|401/i.test(message)) navigate('/login');
      },
    });
  };
  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      setLogoutDialogOpen(false);
      toast.success(t('toast.loggedOut'));
      navigate('/');
    } catch (err) {
      toast.error((err as Error).message || t('toast.refreshError'));
    }
  };

  const isPriceRefreshForCurrentSource = syncType === 'prices' && activeRefreshSource === priceSource;

  const viewTitle =
    view === 'dashboard' ? t('dashboard.marketOverview')
      : view === 'inventory' ? t('dashboard.inventory')
        : view === 'storage' ? t('dashboard.storageUnits')
          : view === 'activity' ? t('nav.activity')
            : t('compare.title');

  const accountStatusNode = isAggregate
    ? <span className="text-xs text-gray-500 self-end pb-1">{t('overview.allAccountsSubtitle')}</span>
    : <AccountStatus steamId={steamId} steam={steam} progress={progress} />;

  return (
    <>
      <div className="h-screen h-dvh grid grid-cols-1 md:grid-cols-[260px_1fr] overflow-hidden">

        {/* ═══ SIDEBAR ═══ */}
        <Sidebar
          navItems={navItems}
          view={view}
          onSwitchView={switchView}
          steamId={steamId}
          showLogout={isOwner}
          onLogoutClick={() => setLogoutDialogOpen(true)}
          netValue={animatedTotal}
          change24h={data.change24h}
          pp={pp}
        />

        {/* ═══ MAIN ═══ */}
        <main ref={mainRef} className="overflow-y-auto px-5 py-8 xl:px-10 relative">
          <div className="grid-overlay" />

          <MobileNav
            navItems={navItems}
            view={view}
            onSwitchView={switchView}
            steamId={steamId}
            isOwner={isOwner}
            showExport={isOwner}
            showLogout={isOwner}
            onLogoutClick={() => setLogoutDialogOpen(true)}
            accountStatus={!isAggregate ? <AccountStatus steamId={steamId} steam={steam} progress={progress} compact /> : undefined}
            onRefreshPrices={handleRefreshPrices}
            refreshPricesDisabled={refreshPricesMutation.isPending || isPriceRefreshForCurrentSource || isRefreshing}
            onRefreshInventory={handleRefreshInventory}
            refreshInventoryDisabled={refreshMutation.isPending || isRefreshing}
            showRefreshInventory={!isAggregate}
          />
          {/* The price window only lives in the desktop header otherwise. */}
          {data.priceWindow && (
            <div className="md:hidden relative z-10 -mt-4 mb-6">
              <span className="text-[11px] text-gray-500" title={t('dashboard.priceWindowTooltip')}>
                {formatPriceWindow(data.priceWindow, locale)}
              </span>
            </div>
          )}

          <DashboardHeader
            title={viewTitle}
            accountStatus={accountStatusNode}
            steamId={steamId}
            isOwner={isOwner}
            showExport={isOwner}
            isRefreshing={isRefreshing}
            syncType={syncType}
            onCancelPriceRefresh={handleCancelPriceRefresh}
            cancelPending={cancelPriceRefreshMutation.isPending}
            onRefreshPrices={handleRefreshPrices}
            refreshPricesDisabled={refreshPricesMutation.isPending || isPriceRefreshForCurrentSource}
            onRefreshInventory={handleRefreshInventory}
            refreshInventoryDisabled={refreshMutation.isPending}
            showRefreshInventory={!isAggregate}
            priceWindowLabel={data.priceWindow ? formatPriceWindow(data.priceWindow, locale) : null}
          />

          {/* ── CONTENT ── */}
          <div className="relative z-10">
            {/* DASHBOARD */}
            {view === 'dashboard' && (
              <div className="fade-up">
                <HeroChart
                  data={data}
                  days={days}
                  onDaysChange={setDays}
                  pp={pp}
                  locale={locale}
                  t={t}
                />

                {isAggregate && <AccountBreakdown pp={pp} />}

                <PortfolioComposition items={data.items} locale={locale} t={t} pp={pp} />

                <TopMovers
                  steamId={steamId}
                  source={priceSource}
                  pp={pp}
                  locale={locale}
                  t={t}
                  items={data.items}
                  onItemClick={setSelectedItem}
                />

                <MarketTrends
                  source={priceSource}
                  pp={pp}
                  locale={locale}
                  t={t}
                  items={data.items}
                  onItemClick={setSelectedItem}
                />

                <div className="flex items-center justify-between mb-4">
                  <span className={SECTION_TITLE}>{t('dashboard.topAssets')}</span>
                </div>
                <div className="space-y-1.5">
                  {data.items.slice(0, 8).map((item) => (
                    <AssetRow key={item.marketHashName} item={item} pp={pp} onSelect={setSelectedItem} />
                  ))}
                </div>
              </div>
            )}

            {/* INVENTORY */}
            {view === 'inventory' && (
              <div className="fade-up">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      ref={searchInputRef}
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      placeholder={t('search.placeholder')}
                      aria-label={t('search.label')}
                      className="w-full h-10 pl-10 pr-9 rounded-xl bg-sf-card border border-white/[0.08] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-sf-cyan/30"
                    />
                    {search !== '' && (
                      <button
                        onClick={() => { setSearch(''); setPage(1); searchInputRef.current?.focus(); }}
                        aria-label={t('search.clear')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="h-10 min-w-[190px] rounded-xl border border-white/[0.08] bg-sf-card px-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">{t('sort.by')}</span>
                    <select
                      value={sort}
                      onChange={(e) => {
                        const next = e.target.value as typeof sort;
                        setSort(next);
                        setSortDir(SORT_DEFAULT_DIR[next]);
                        setPage(1);
                      }}
                      aria-label={t('sort.by')}
                      className="h-full flex-1 bg-transparent text-sm text-white focus:outline-none"
                    >
                      <option value="price">{t('sort.price')}</option>
                      <option value="quantity">{t('sort.quantity')}</option>
                      <option value="name">{t('sort.name')}</option>
                      <option value="float">{t('sort.float')}</option>
                    </select>
                  </div>
                  <div className="flex gap-1.5">
                    <GhostIconButton
                      onClick={() => { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); setPage(1); }}
                      title={t('sort.direction')}
                      ariaLabel={t('sort.direction')}
                    >
                      {sortDir === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                    </GhostIconButton>
                    <GhostIconButton active={viewMode === 'list'} onClick={() => changeViewMode('list')} title={t('view.list')} ariaLabel={t('view.list')}>
                      <List className="w-4 h-4" />
                    </GhostIconButton>
                    <GhostIconButton active={viewMode === 'cards'} onClick={() => changeViewMode('cards')} title={t('view.cards')} ariaLabel={t('view.cards')}>
                      <LayoutGrid className="w-4 h-4" />
                    </GhostIconButton>
                    {viewMode === 'list' && (
                      <GhostIconButton active={compact} onClick={toggleCompact} title={t('view.compact')} ariaLabel={t('view.compact')}>
                        <AlignJustify className="w-4 h-4" />
                      </GhostIconButton>
                    )}
                  </div>
                  <button
                    onClick={() => { setIncludeStorage(!includeStorage); setPage(1); }}
                    aria-pressed={includeStorage}
                    className={`h-10 px-4 rounded-xl text-xs transition-all flex items-center gap-2 ${includeStorage ? 'bg-sf-purple/15 text-sf-purple border border-sf-purple/30' : 'bg-white/[0.04] text-gray-400 hover:text-white border border-white/[0.06]'}`}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {t('inventory.includeStorage')}
                  </button>
                  <span className="ml-auto font-mono text-base text-sf-cyan font-bold">{formatEur(inventoryTotal, pp)}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <div className="h-10 min-w-[150px] rounded-xl border border-white/[0.08] bg-sf-card px-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">{t('filter.rarity')}</span>
                    <select
                      value={rarityFilter}
                      onChange={(e) => { setRarityFilter(e.target.value); setPage(1); }}
                      aria-label={t('filter.rarity')}
                      className="h-full flex-1 bg-transparent text-sm text-white focus:outline-none"
                    >
                      <option value="">{t('filter.all')}</option>
                      {rarityOptions.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="h-10 min-w-[150px] rounded-xl border border-white/[0.08] bg-sf-card px-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">{t('filter.type')}</span>
                    <select
                      value={typeFilter}
                      onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                      aria-label={t('filter.type')}
                      className="h-full flex-1 bg-transparent text-sm text-white focus:outline-none"
                    >
                      <option value="">{t('filter.all')}</option>
                      {typeOptions.map((c) => (
                        <option key={c} value={c}>{t(CATEGORY_LABEL_KEYS[c])}</option>
                      ))}
                    </select>
                  </div>
                  <div className="h-10 min-w-[150px] rounded-xl border border-white/[0.08] bg-sf-card px-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">{t('filter.quality')}</span>
                    <select
                      value={qualityFilter}
                      onChange={(e) => { setQualityFilter(e.target.value as QualityFilter); setPage(1); }}
                      aria-label={t('filter.quality')}
                      className="h-full flex-1 bg-transparent text-sm text-white focus:outline-none"
                    >
                      <option value="">{t('filter.all')}</option>
                      <option value="stattrak">StatTrak</option>
                      <option value="souvenir">Souvenir</option>
                      <option value="normal">{t('filter.normal')}</option>
                    </select>
                  </div>
                  <button
                    onClick={() => { setStickeredOnly(!stickeredOnly); setPage(1); }}
                    aria-pressed={stickeredOnly}
                    className={`h-10 px-4 rounded-xl text-xs transition-all border ${stickeredOnly ? 'bg-sf-cyan/15 text-sf-cyan border-sf-cyan/30' : 'bg-white/[0.04] text-gray-400 hover:text-white border-white/[0.06]'}`}
                  >
                    {t('filter.withStickers')}
                  </button>
                  <button
                    onClick={() => { setNotablePatternsOnly(!notablePatternsOnly); setPage(1); }}
                    aria-pressed={notablePatternsOnly}
                    className="h-10 px-4 rounded-xl text-xs transition-all border inline-flex items-center gap-1.5"
                    style={
                      notablePatternsOnly
                        ? { background: '#f0b90b26', color: '#f0b90b', borderColor: '#f0b90b4d' }
                        : { background: 'rgba(255,255,255,0.04)', color: '#9ca3af', borderColor: 'rgba(255,255,255,0.06)' }
                    }
                  >
                    <span aria-hidden="true">{'♦'}</span>
                    {t('filter.notablePatterns')}
                  </button>
                  {hasActiveFilters && (
                    <div className="flex items-center gap-3 ml-auto">
                      <span className="font-mono text-xs text-gray-500">
                        {formatCount(filtered.length)} / {formatCount(baseItems.length)} {t('dashboard.itemsLabel')}
                      </span>
                      <button onClick={resetFilters} className="text-xs text-sf-cyan hover:underline">
                        {t('filter.reset')}
                      </button>
                    </div>
                  )}
                </div>

                {viewMode === 'list' ? (
                  <div className="space-y-1">
                    {paginated.map((item) => (
                      <AssetRow key={item.marketHashName} item={item} pp={pp} compact={compact} onSelect={setSelectedItem} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {paginated.map((item) => (
                      <ItemCard key={item.marketHashName} item={item} onClick={() => setSelectedItem(item)} />
                    ))}
                  </div>
                )}

                {filtered.length === 0 && (
                  <div className="sf-card p-10 text-center">
                    <Search className="w-10 h-10 text-sf-dim mx-auto mb-3" />
                    <p className="text-sm font-semibold text-white mb-1">{t('empty.noResults')}</p>
                    <p className="text-xs text-gray-500">{t('empty.noResultsDesc')}</p>
                    {hasActiveFilters && (
                      <button onClick={resetFilters} className="mt-4 text-xs text-[color:var(--accent)] hover:underline">
                        {t('filter.reset')}
                      </button>
                    )}
                  </div>
                )}

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1} aria-label={t('pagination.prevPage')} className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = Math.max(1, Math.min(totalPages - 4, safePage - 2)) + i;
                      return p <= totalPages ? <button key={p} onClick={() => setPage(p)} className={`w-10 h-10 rounded-lg text-xs ${p === safePage ? 'btn-accent font-semibold' : 'bg-white/5 hover:bg-white/10'}`}>{p}</button> : null;
                    })}
                    <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} aria-label={t('pagination.nextPage')} className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            )}

            {/* STORAGE */}
            {view === 'storage' && (
              <div className="space-y-4 fade-up">
                {data.storageUnits.length === 0 && data.emptyStorageUnits === 0 ? (
                  <div className="sf-card p-10 text-center">
                    <FolderOpen className="w-10 h-10 text-sf-dim mx-auto mb-3" />
                    <p className="text-sm font-semibold text-white mb-1">{t('empty.noStorageUnits')}</p>
                    <p className="text-xs text-gray-500">{t('empty.noStorageUnitsDesc')}</p>
                  </div>
                ) : (
                  <>
                    {sortedStorageUnits.length > 1 && (
                      <div className="flex items-center">
                        <div className="h-10 min-w-[190px] rounded-xl border border-white/[0.08] bg-sf-card px-3 flex items-center gap-2">
                          <span className="text-xs text-gray-500 whitespace-nowrap">{t('sort.by')}</span>
                          <select
                            value={storageSort}
                            onChange={(e) => setStorageSort(e.target.value as typeof storageSort)}
                            aria-label={t('sort.by')}
                            className="h-full flex-1 bg-transparent text-sm text-white focus:outline-none"
                          >
                            <option value="value">{t('sort.value')}</option>
                            <option value="name">{t('sort.name')}</option>
                            <option value="count">{t('sort.itemCount')}</option>
                          </select>
                        </div>
                      </div>
                    )}
                    {sortedStorageUnits.map((unit) => (
                      <StorageSection
                        key={unit.casketId}
                        unit={unit}
                        pp={pp}
                        valueRatio={maxStorageValue > 0 ? unit.totalValue / maxStorageValue : 0}
                        onItemClick={setSelectedItem}
                      />
                    ))}
                    {data.emptyStorageUnits > 0 && (
                      <div className="sf-card p-5 border border-dashed border-white/15 bg-white/[0.02]">
                        <p className="text-sm font-semibold text-gray-300">
                          x{formatCount(data.emptyStorageUnits)} {t('storage.emptyUnits')}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* COMPARE */}
            {view === 'compare' && (
              <CompareView
                steamId={steamId}
                pp={pp}
                trackedSources={trackedSources}
                primarySource={priceSource}
              />
            )}

            {/* ACTIVITY */}
            {view === 'activity' && (
              <ActivityView
                data={data}
                steamId={steamId}
                pp={pp}
                locale={locale}
                isAggregate={isAggregate}
                isRefreshing={isRefreshing}
                syncType={syncType}
                source={activeRefreshSource}
                selectedPriceSource={priceSource}
                lastRefresh={lastRefresh}
                progress={progress}
                onRefreshPrices={handleRefreshPrices}
                onCancelPriceRefresh={handleCancelPriceRefresh}
                isRefreshPricesPending={refreshPricesMutation.isPending || isPriceRefreshForCurrentSource}
                isCancelPriceRefreshPending={cancelPriceRefreshMutation.isPending}
              />
            )}
          </div>
        </main>
      </div>

      <ConfirmDialog
        open={logoutDialogOpen}
        onOpenChange={setLogoutDialogOpen}
        title={t('logout.title')}
        description={t('logout.description')}
        confirmLabel={t('logout.confirm')}
        cancelLabel={t('logout.cancel')}
        onConfirm={handleLogout}
        pending={logout.isPending}
      />

      <ItemDetailModal item={liveSelectedItem} steamId={steamId} readOnly={isAggregate} open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }} />
    </>
  );
}

export default DashboardPage;
