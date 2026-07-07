import React, { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import {
  useDashboardData,
  useRefreshInventory,
  useRefreshPrices,
  useCancelPriceRefresh,
  useMovers,
  useTrends,
  useTrackedSources,
} from '../../hooks/useApi.ts';
import { useRefreshPolling } from '../../hooks/usePolling.ts';
import { useI18n, applyFees, type PriceProvider, type TranslationKey } from '../../lib/i18n.tsx';
import { formatEur, formatPercent, formatDate, computePnl } from '../../lib/formatters.ts';
import { getDisplayItemName } from '../../lib/item-display.ts';
import { detectPatterns } from '../../../shared/lib/patterns.ts';
import { ItemDetailModal } from '../inventory/ItemDetailModal.tsx';
import { ItemCard } from '../inventory/ItemCard.tsx';
import { useToast } from '../../components/toast.tsx';
import { PillButton, GhostIconButton } from '../../components/controls.tsx';
import { AccountStatus } from '../../components/AccountStatus.tsx';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { useCountUp } from '../../hooks/useCountUp.ts';
import {
  LayoutDashboard, Package, FolderOpen, Search, ChevronDown,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  Activity, LayoutGrid, List, AlignJustify, Scale,
} from 'lucide-react';
import type { ItemGroup, StorageUnit } from '../../../shared/types/inventory.ts';
import type { HistoryPoint, Mover } from '../../../shared/types/api.ts';
import { ALL_PROFILES_ID } from '../../../shared/constants/profiles.ts';
import { REDUCED_MOTION, SECTION_TITLE, activationKeyDown, type View } from './shared.ts';
import { Sidebar, type NavItem } from './Sidebar.tsx';
import { MobileNav } from './MobileNav.tsx';
import { DashboardHeader } from './DashboardHeader.tsx';
import { ActivityView } from './ActivityView.tsx';
import { CompareView } from './CompareView.tsx';
import { AccountBreakdown } from './AccountBreakdown.tsx';

// ── Helpers ──

function chartPath(data: HistoryPoint[], w: number, h: number) {
  if (data.length < 2) {
    return {
      line: '',
      fill: '',
      last: null as { x: number; y: number } | null,
      points: [] as { x: number; y: number }[],
    };
  }
  const vals = data.map((d) => d.value);
  const mn = Math.min(...vals) * 0.95;
  const mx = Math.max(...vals) * 1.05;
  const rng = mx - mn || 1;
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((d.value - mn) / rng) * h * 0.88 - h * 0.06,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return { line, fill: `${line} L${w},${h} L0,${h} Z`, last: pts[pts.length - 1], points: pts };
}

function weaponTag(name: string): string {
  const c = name.replace(/^★\s*/, '').replace(/^StatTrak™\s*/, '').replace(/^Souvenir\s*/, '');
  const w = c.split(' | ')[0];
  if (w.includes('AWP')) return 'AWP';
  if (w.includes('AK-47')) return 'AK';
  if (w.includes('M4A4') || w.includes('M4A1-S')) return 'M4';
  if (w.includes('USP')) return 'USP';
  if (w.includes('Glock')) return 'GLK';
  if (w.includes('Desert Eagle')) return 'DE';
  if (w.includes('Five-SeveN')) return '57';
  if (w.includes('P250')) return 'P25';
  if (w.includes('P90')) return 'P90';
  if (w.includes('MAC-10')) return 'MAC';
  if (w.includes('SSG')) return 'SSG';
  if (w.includes('FAMAS')) return 'FMS';
  if (w.includes('Galil')) return 'GAL';
  if (w.includes('AUG')) return 'AUG';
  if (w.includes('SG 553')) return 'SG';
  if (w.includes('SCAR')) return 'SCR';
  if (w.includes('Nova') || w.includes('XM') || w.includes('MAG') || w.includes('Sawed')) return 'SHG';
  if (w.includes('Negev') || w.includes('M249')) return 'LMG';
  if (w.includes('MP') || w.includes('UMP') || w.includes('PP-Bizon')) return 'SMG';
  if (name.includes('Knife') || name.includes('Bayonet') || name.includes('Karambit') || name.includes('Daggers') || name.includes('Stiletto') || name.includes('Talon') || name.includes('Skeleton') || name.includes('Kukri')) return 'KNF';
  if (name.includes('Gloves') || name.includes('Wraps')) return 'GLV';
  if (name.includes('Sticker')) return 'STK';
  if (name.includes('Case') || name.includes('Container')) return 'CSE';
  return w.substring(0, 3).toUpperCase();
}

type ItemCategoryId =
  | 'knife' | 'gloves' | 'rifle' | 'pistol' | 'smg'
  | 'sniper' | 'heavy' | 'sticker' | 'case' | 'agent' | 'other';

const CATEGORY_ORDER: ItemCategoryId[] = [
  'knife', 'gloves', 'rifle', 'pistol', 'smg', 'sniper', 'heavy', 'sticker', 'case', 'agent', 'other',
];

const CATEGORY_LABEL_KEYS: Record<ItemCategoryId, TranslationKey> = {
  knife: 'type.knife',
  gloves: 'type.gloves',
  rifle: 'type.rifle',
  pistol: 'type.pistol',
  smg: 'type.smg',
  sniper: 'type.sniper',
  heavy: 'type.heavy',
  sticker: 'type.sticker',
  case: 'type.case',
  agent: 'type.agent',
  other: 'type.other',
};

function itemCategory(name: string): ItemCategoryId {
  const cleaned = name.replace(/^★\s*/, '').replace(/^StatTrak™\s*/, '').replace(/^Souvenir\s*/, '');
  const weapon = cleaned.split(' | ')[0];
  if (name.includes('Gloves') || name.includes('Wraps')) return 'gloves';
  if (name.startsWith('★') || /Knife|Bayonet|Karambit|Daggers/.test(weapon)) return 'knife';
  if (/AWP|SSG 08|SCAR-20|G3SG1/.test(weapon)) return 'sniper';
  if (/AK-47|M4A4|M4A1-S|FAMAS|Galil|AUG|SG 553/.test(weapon)) return 'rifle';
  if (/USP|Glock|P250|Five-SeveN|Desert Eagle|Tec-9|CZ75|Dual Berettas|R8 Revolver|P2000/.test(weapon)) return 'pistol';
  if (/MP9|MP7|MP5|MAC-10|UMP|P90|PP-Bizon/.test(weapon)) return 'smg';
  if (/Nova|XM1014|MAG-7|Sawed-Off|Negev|M249/.test(weapon)) return 'heavy';
  if (/Zeus/.test(weapon)) return 'pistol';
  // Capsules/cases first: "Sticker Capsule" is a container, not a sticker.
  if (/Case|Container|Capsule|Package/.test(name)) return 'case';
  if (name.includes('Sticker')) return 'sticker';
  if (
    name.includes('Agent')
    || (!name.includes('Graffiti') && !name.includes('Patch')
      && /\|\s*(The Professionals|FBI|SWAT|SEAL|NSWC|KSK|TACP|NZSAS|SAS|Sabre|Guerrilla|Phoenix|Elite Crew|Gendarmerie|Brazilian)/.test(name))
  ) return 'agent';
  return 'other';
}

type QualityFilter = '' | 'stattrak' | 'souvenir' | 'normal';

function formatPriceWindow(pw: { from: string; to: string }, locale: string): string {
  const loc = locale === 'fr' ? 'fr-FR' : 'en-US';
  const from = new Date(pw.from + (pw.from.includes('Z') ? '' : 'Z'));
  const to = new Date(pw.to + (pw.to.includes('Z') ? '' : 'Z'));
  const datePart = to.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
  const fromTime = from.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  const toTime = to.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (fromTime === toTime) return `${datePart} ${fromTime}`;
  return `${datePart} ${fromTime}\u2013${toTime}`;
}

const PER_PAGE = 30;

const COUNT_FORMATTERS: Record<'fr' | 'en', Intl.NumberFormat> = {
  fr: new Intl.NumberFormat('fr-FR'),
  en: new Intl.NumberFormat('en-US'),
};

// App shell rendered immediately while the dashboard data loads: real sidebar
// frame + shimmer blocks where the hero and asset rows will appear.
function DashboardSkeleton() {
  return (
    <div className="h-screen grid grid-cols-1 md:grid-cols-[260px_1fr] overflow-hidden">
      <aside className="sf-sidebar hidden md:flex flex-col py-8 px-6">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-1 h-6 rounded-full bg-[color:var(--accent)]" />
          <span className="font-display text-xl font-bold">SkinCapital</span>
        </div>
        <div className="space-y-2">
          <div className="skeleton h-10" />
          <div className="skeleton h-10" />
          <div className="skeleton h-10" />
        </div>
        <div className="mt-auto skeleton h-24" />
      </aside>
      <main className="overflow-y-auto px-5 py-8 xl:px-10">
        <div className="skeleton h-8 w-56 mb-8" />
        <div className="skeleton h-40 mb-8" />
        <div className="space-y-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-[88px]" />
          ))}
        </div>
      </main>
    </div>
  );
}

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
  const [sort, setSort] = useState<'price' | 'name' | 'float' | 'quantity'>(() => {
    const s = searchParams.get('sort');
    return s === 'name' || s === 'float' || s === 'quantity' ? s : 'price';
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
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [compact, setCompact] = useState(() => localStorage.getItem('inventoryDensity') === 'compact');
  const [includeStorage, setIncludeStorage] = useState(() => searchParams.get('storage') === '1');
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [chartHover, setChartHover] = useState<number | null>(null);
  const [storageSort, setStorageSort] = useState<'value' | 'name' | 'count'>('value');
  const toast = useToast();

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== 'dashboard') params.set('view', view);
    if (search) params.set('q', search);
    if (sort !== 'price') params.set('sort', sort);
    if (rarityFilter) params.set('rarity', rarityFilter);
    if (typeFilter) params.set('type', typeFilter);
    if (qualityFilter) params.set('quality', qualityFilter);
    if (stickeredOnly) params.set('stickers', '1');
    if (notablePatternsOnly) params.set('patterns', '1');
    if (includeStorage) params.set('storage', '1');
    if (page > 1) params.set('page', String(page));
    setSearchParams(params, { replace: true });
  }, [view, search, sort, rarityFilter, typeFilter, qualityFilter, stickeredOnly, notablePatternsOnly, includeStorage, page, setSearchParams]);

  const toggleCompact = () => {
    setCompact((prev) => {
      const next = !prev;
      localStorage.setItem('inventoryDensity', next ? 'compact' : 'comfortable');
      return next;
    });
  };
  const { isRefreshing, syncType, source: activeRefreshSource, lastRefresh, progress, steam } = useRefreshPolling(
    steamId,
    priceSource,
  );
  const { data, isLoading, isError, refetch } = useDashboardData(steamId!, days, priceSource, isRefreshing);
  const refreshMutation = useRefreshInventory();
  const refreshPricesMutation = useRefreshPrices();
  const cancelPriceRefreshMutation = useCancelPriceRefresh();

  const isAggregate = steamId === ALL_PROFILES_ID;
  const isOwner = !!status?.isLoggedIn && status?.steamId === steamId;

  // Comparator tab only exists once 2+ price sources are tracked (Settings).
  const { data: trackedSourcesData } = useTrackedSources();
  const trackedSources = trackedSourcesData?.sources ?? ['steam'];
  const showCompare = trackedSources.length >= 2;

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
    if (sort === 'name') {
      r = [...r].sort((a, b) => {
        const aName = getDisplayItemName(a.marketHashName, a.wear?.name);
        const bName = getDisplayItemName(b.marketHashName, b.wear?.name);
        return aName.localeCompare(bName);
      });
    }
    else if (sort === 'quantity') r = [...r].sort((a, b) => b.quantity - a.quantity || b.total - a.total);
    else if (sort === 'float') r = [...r].sort((a, b) => (a.floatValue ?? 1) - (b.floatValue ?? 1));
    else r = [...r].sort((a, b) => b.total - a.total);
    return r;
  }, [baseItems, view, search, sort, rarityFilter, typeFilter, qualityFilter, stickeredOnly, notablePatternsOnly]);

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

  // Value-weighted dominant rarity color: blended into the hero glow so the
  // flagship card subtly reflects what the portfolio is made of.
  const dominantRarityColor = useMemo(() => {
    const weights = new Map<string, number>();
    let best: string | null = null;
    let bestWeight = 0;
    for (const item of data?.items ?? []) {
      if (item.total <= 0) continue;
      const w = (weights.get(item.rarity.color) ?? 0) + item.total;
      weights.set(item.rarity.color, w);
      if (w > bestWeight) { bestWeight = w; best = item.rarity.color; }
    }
    return best;
  }, [data]);

  // Animated ticker shared by the hero total and the sidebar valuation.
  const animatedTotal = useCountUp(data?.totalValue ?? 0);

  if (!steamId) return <Navigate to="/" replace />;

  if (isError && !data) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-400 mb-4">
            {locale === 'fr' ? 'Erreur de chargement des données.' : 'Failed to load data.'}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-lg bg-sf-cyan/10 text-sf-cyan text-sm hover:bg-sf-cyan/20"
          >
            {locale === 'fr' ? 'Réessayer' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return <DashboardSkeleton />;
  }

  const chart = chartPath(data.historyData, 400, 150);
  // Shared P&L basis: net-of-fees in steam_fees mode, stickers included (same
  // computation as AssetRow and ItemDetailModal — server invested/pnl unused).
  const pnlStats = computePnl(data.items, pp);
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
  // graceful no-op everywhere else and for reduced-motion users.
  const switchView = (v: View) => {
    const applyView = () => { setView(v); resetFilters(); };
    const startViewTransition = (document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    }).startViewTransition;
    if (REDUCED_MOTION || v === view || typeof startViewTransition !== 'function') {
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
  const handleRefreshPrices = () => {
    if (steamId) {
      refreshPricesMutation.mutate(
        { steamId, source: priceSource, scope: 'stale_or_missing' },
        { onError: (err) => toast.error((err as Error).message || t('toast.refreshError')) },
      );
    }
  };
  const handleCancelPriceRefresh = () => {
    if (steamId) {
      cancelPriceRefreshMutation.mutate(steamId, {
        onError: (err) => toast.error((err as Error).message || t('toast.refreshError')),
      });
    }
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

  // Hero chart crosshair: nearest data point under the cursor (desktop nicety).
  const handleChartMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (data.historyData.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (data.historyData.length - 1));
    setChartHover(Math.max(0, Math.min(data.historyData.length - 1, idx)));
  };
  const hoverPoint = chartHover !== null ? chart.points[chartHover] : undefined;
  const hoverDatum = chartHover !== null ? data.historyData[chartHover] : undefined;
  const hoverPct = hoverPoint ? (hoverPoint.x / 400) * 100 : 0;

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
      <div className="h-screen grid grid-cols-1 md:grid-cols-[260px_1fr] overflow-hidden">

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
        <main className="overflow-y-auto px-5 py-8 xl:px-10 relative">
          <div className="grid-overlay" />

          <MobileNav
            navItems={navItems}
            view={view}
            onSwitchView={switchView}
            steamId={steamId}
            isOwner={isOwner}
            showExport={isOwner}
            accountStatus={!isAggregate ? <AccountStatus steamId={steamId} steam={steam} progress={progress} compact /> : undefined}
            onRefreshPrices={handleRefreshPrices}
            refreshPricesDisabled={refreshPricesMutation.isPending || isPriceRefreshForCurrentSource || isRefreshing}
            onRefreshInventory={handleRefreshInventory}
            refreshInventoryDisabled={refreshMutation.isPending || isRefreshing}
            showRefreshInventory={!isAggregate}
          />

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
                <section className="sf-card relative overflow-hidden p-6 mb-8">
                  {/* Faint radial glow behind the flagship number, tinted by the
                      value-weighted dominant rarity blended into the accent.
                      glow-grain adds noise INSIDE the halo (textured light). */}
                  <div
                    className="glow-grain pointer-events-none absolute -top-16 -left-12 w-96 h-56"
                    style={{
                      background: `radial-gradient(closest-side, color-mix(in srgb, ${
                        dominantRarityColor
                          ? `color-mix(in srgb, ${dominantRarityColor} 30%, var(--accent))`
                          : 'var(--accent)'
                      } 12%, transparent), transparent)`,
                    }}
                  />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className={SECTION_TITLE}>{t('dashboard.portfolioPerformance')}</div>
                      <div className="flex gap-1">
                        {[7, 30, 90].map((d) => (
                          <PillButton key={d} active={days === d} onClick={() => setDays(d)}>
                            {locale === 'fr' ? `${d}J` : `${d}D`}
                          </PillButton>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-3 flex-wrap">
                      <span className="text-value-hero text-5xl tracking-tight font-bold tabular-nums">
                        {formatEur(animatedTotal, pp)}
                      </span>
                      {data.change24h.hasData && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-mono ${data.change24h.change >= 0 ? 'bg-sf-green/10 text-sf-green' : 'bg-sf-pink/10 text-sf-pink'}`}>
                          {data.change24h.change >= 0 ? '\u25b2' : '\u25bc'}
                          {data.change24h.change >= 0 ? '+' : ''}{formatEur(data.change24h.change, pp)} ({formatPercent(data.change24h.percentage)})
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-sf-secondary">
                      {formatCount(data.totalItems)} {t('dashboard.itemsLabel')} &middot; {formatCount(data.uniqueItems)} {t('dashboard.uniqueLabel')}
                      {pnlStats.count > 0 && (
                        <span className="ml-2 font-mono text-xs">
                          {t('dashboard.invested')} {formatEur(pnlStats.invested)} &middot;{' '}
                          <span className={pnlStats.pnl >= 0 ? 'text-sf-green' : 'text-sf-pink'}>
                            P&amp;L {pnlStats.pnl >= 0 ? '+' : ''}{formatEur(pnlStats.pnl)}
                          </span>
                        </span>
                      )}
                    </div>
                    <div
                      className="h-44 mt-6 relative"
                      onMouseMove={chart.line ? handleChartMove : undefined}
                      onMouseLeave={() => setChartHover(null)}
                    >
                      {chart.line ? (
                        <svg viewBox="0 0 400 150" preserveAspectRatio="none" className="w-full h-full">
                          <defs>
                            <linearGradient id="sfCG" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          {[37.5, 75, 112.5].map((y) => (
                            <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#ffffff" strokeOpacity="0.04" vectorEffect="non-scaling-stroke" />
                          ))}
                          <path d={chart.fill} fill="url(#sfCG)" />
                          <path d={chart.line} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                          {chart.last && (
                            <>
                              {/* Pulsing halo on the live point (SMIL, skipped for reduced motion) */}
                              <circle cx={chart.last.x} cy={chart.last.y} r="6" fill="var(--accent)" opacity="0.25">
                                {!REDUCED_MOTION && (
                                  <>
                                    <animate attributeName="r" values="4;7;4" dur="2.4s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite" />
                                  </>
                                )}
                              </circle>
                              <circle cx={chart.last.x} cy={chart.last.y} r="3" fill="var(--accent)" />
                            </>
                          )}
                          {hoverPoint && (
                            <>
                              <line
                                x1={hoverPoint.x} y1="0" x2={hoverPoint.x} y2="150"
                                stroke="#ffffff" strokeOpacity="0.18" vectorEffect="non-scaling-stroke"
                              />
                              <circle cx={hoverPoint.x} cy={hoverPoint.y} r="3.5" fill="var(--accent)" />
                            </>
                          )}
                        </svg>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">{t('dashboard.noChartData')}</div>
                      )}
                      {hoverPoint && hoverDatum && (
                        <div
                          className="pointer-events-none absolute top-1 z-10 px-2.5 py-1.5 rounded-lg bg-sf-card border border-white/[0.1] shadow-xl whitespace-nowrap"
                          style={{
                            left: `${hoverPct}%`,
                            transform: hoverPct < 12 ? 'translateX(0)' : hoverPct > 88 ? 'translateX(-100%)' : 'translateX(-50%)',
                          }}
                        >
                          <div className="font-mono text-[10px] text-gray-400">{formatDate(hoverDatum.date, locale)}</div>
                          <div className="font-mono text-sm font-bold text-white">{formatEur(hoverDatum.value, pp)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

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
                    <AssetRow key={item.marketHashName} item={item} pp={pp} onClick={() => setSelectedItem(item)} />
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
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      placeholder={t('search.placeholder')}
                      aria-label={t('search.label')}
                      className="w-full h-10 pl-10 pr-4 rounded-xl bg-sf-card border border-white/[0.08] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-sf-cyan/30"
                    />
                  </div>
                  <div className="h-10 min-w-[190px] rounded-xl border border-white/[0.08] bg-sf-card px-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">{t('sort.by')}</span>
                    <select
                      value={sort}
                      onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }}
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
                    <GhostIconButton active={viewMode === 'list'} onClick={() => setViewMode('list')} title={t('view.list')} ariaLabel={t('view.list')}>
                      <List className="w-4 h-4" />
                    </GhostIconButton>
                    <GhostIconButton active={viewMode === 'cards'} onClick={() => setViewMode('cards')} title={t('view.cards')} ariaLabel={t('view.cards')}>
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
                        {formatCount(filtered.length)} / {formatCount(baseItems.length)} items
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
                      <AssetRow key={item.marketHashName} item={item} pp={pp} compact={compact} onClick={() => setSelectedItem(item)} />
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
                    <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1} aria-label={t('pagination.prevPage')} className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = Math.max(1, Math.min(totalPages - 4, safePage - 2)) + i;
                      return p <= totalPages ? <button key={p} onClick={() => setPage(p)} className={`w-9 h-9 rounded-lg text-xs ${p === safePage ? 'btn-accent font-semibold' : 'bg-white/5 hover:bg-white/10'}`}>{p}</button> : null;
                    })}
                    <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} aria-label={t('pagination.nextPage')} className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
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

// ── Sub-Components ──

// Brand sf-* tokens first (cyan, purple, gold, green, pink, secondary), then a neutral.
const COMPOSITION_PALETTE = ['#00ccff', '#a020f0', '#f0b90b', '#4ADE80', '#ff3366', '#8b949e', '#64748b'];

function PortfolioComposition({ items, locale, t, pp }: {
  items: ItemGroup[];
  locale: 'fr' | 'en';
  t: (key: TranslationKey) => string;
  pp: PriceProvider;
}) {
  const { segments, total } = useMemo(() => {
    const totals = new Map<ItemCategoryId, number>();
    for (const item of items) {
      if (item.total <= 0) continue;
      const cat = itemCategory(item.marketHashName);
      totals.set(cat, (totals.get(cat) ?? 0) + item.total);
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const segs = sorted.slice(0, 6).map(([cat, value], i) => ({ cat, value, color: COMPOSITION_PALETTE[i] }));
    const overflow = sorted.slice(6).reduce((sum, [, value]) => sum + value, 0);
    if (overflow > 0) {
      const existingOther = segs.find((s) => s.cat === 'other');
      if (existingOther) existingOther.value += overflow;
      else segs.push({ cat: 'other', value: overflow, color: COMPOSITION_PALETTE[6] });
    }
    return { segments: segs, total: segs.reduce((sum, s) => sum + s.value, 0) };
  }, [items]);

  // Legend-row hover <-> donut arc sync (hovered arc thickens, others dim).
  const [hoverCat, setHoverCat] = useState<ItemCategoryId | null>(null);
  // Flipped one frame after mount so the arcs transition from empty (draw-in).
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const animatedTotal = useCountUp(total);

  if (total <= 0) return null;

  const pctFormat = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  });

  // Donut geometry: r=48 in a 120 viewBox, segments drawn via strokeDasharray
  // with a 2px gap, starting at 12 o'clock (rotate -90).
  const DONUT_R = 48;
  const DONUT_C = 2 * Math.PI * DONUT_R;
  const DONUT_GAP = 2;
  let arcStart = 0;
  const donutSegments = segments.map((s) => {
    const arc = (s.value / total) * DONUT_C;
    const seg = { ...s, dash: Math.max(0, arc - DONUT_GAP), offset: -arcStart };
    arcStart += arc;
    return seg;
  });

  return (
    <section className="sf-card p-6 mb-8">
      <div className={`${SECTION_TITLE} mb-4`}>{t('portfolio.composition')}</div>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative w-[120px] h-[120px] shrink-0" aria-hidden="true">
          <svg viewBox="0 0 120 120" className="w-full h-full">
            {donutSegments.map((s) => (
              <circle
                key={s.cat}
                className="donut-seg"
                cx="60"
                cy="60"
                r={DONUT_R}
                fill="none"
                stroke={s.color}
                strokeWidth={hoverCat === s.cat ? 15 : 12}
                strokeDasharray={drawn ? `${s.dash} ${DONUT_C - s.dash}` : `0 ${DONUT_C}`}
                strokeDashoffset={s.offset}
                opacity={hoverCat !== null && hoverCat !== s.cat ? 0.35 : 1}
                transform="rotate(-90 60 60)"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-[13px] font-bold text-white tabular-nums">{formatEur(animatedTotal, pp)}</span>
          </div>
        </div>
        <div className="flex-1 w-full min-w-0">
          <div className="h-3 rounded-full overflow-hidden flex gap-px bg-white/[0.04]">
            {segments.map((s) => (
              <div
                key={s.cat}
                title={t(CATEGORY_LABEL_KEYS[s.cat])}
                className="transition-all hover:opacity-80"
                style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
            {segments.map((s) => (
              <div
                key={s.cat}
                className="flex items-center gap-2 text-xs min-w-0"
                onMouseEnter={() => setHoverCat(s.cat)}
                onMouseLeave={() => setHoverCat(null)}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-gray-400 truncate">{t(CATEGORY_LABEL_KEYS[s.cat])}</span>
                <span className="font-mono text-white ml-auto">{formatEur(s.value, pp)}</span>
                <span className="font-mono text-gray-500 w-12 text-right">{pctFormat.format(s.value / total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TopMovers({ steamId, source, pp, locale, t, items, onItemClick }: {
  steamId: string;
  source: 'steam' | 'csfloat' | 'skinport';
  pp: PriceProvider;
  locale: 'fr' | 'en';
  t: (key: TranslationKey) => string;
  items: ItemGroup[];
  onItemClick: (item: ItemGroup) => void;
}) {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, isLoading } = useMovers(steamId, source, days);

  const handleRowClick = (name: string) => {
    const item = items.find((i) => i.marketHashName === name);
    if (item) onItemClick(item);
  };

  const renderColumn = (label: string, movers: Mover[], positive: boolean) => (
    <div className="min-w-0">
      <div className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${positive ? 'text-sf-green' : 'text-sf-pink'}`}>
        {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        {label}
      </div>
      {movers.length > 0 ? (
        <div className="space-y-1">
          {movers.map((m) => {
            const item = items.find((i) => i.marketHashName === m.name);
            const clickable = !!item;
            return (
              <div
                key={m.name}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => handleRowClick(m.name) : undefined}
                onKeyDown={clickable ? activationKeyDown(() => handleRowClick(m.name)) : undefined}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${clickable ? 'cursor-pointer hover:bg-white/[0.04] transition-colors' : ''}`}
              >
                <span className="text-xs text-gray-300 truncate flex-1 min-w-0">
                  {getDisplayItemName(m.name, item?.wear?.name)}
                </span>
                <span className={`font-mono text-xs shrink-0 ${positive ? 'text-sf-green' : 'text-sf-pink'}`}>
                  {formatPercent(m.changePct)}
                </span>
                <span className="font-mono text-xs text-white shrink-0 w-20 text-right">
                  {formatEur(m.newPrice, source === 'steam' ? pp : undefined)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-2.5 py-1.5 text-xs text-gray-600">{t('movers.none')}</div>
      )}
    </div>
  );

  return (
    <section className="sf-card p-6 mb-8">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <span className={SECTION_TITLE}>{t('movers.title')}</span>
        <div className="flex gap-1">
          {([7, 30] as const).map((d) => (
            <PillButton key={d} active={days === d} onClick={() => setDays(d)}>
              {locale === 'fr' ? `${d}J` : `${d}D`}
            </PillButton>
          ))}
        </div>
      </div>
      {isLoading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
      ) : data.gainers.length === 0 && data.losers.length === 0 ? (
        <div className="py-6 text-center">
          <TrendingUp className="w-10 h-10 text-sf-dim mx-auto mb-3" />
          <p className="text-sm font-semibold text-white mb-1">{t('movers.none')}</p>
          <p className="text-xs text-gray-500">{t('empty.moversDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {renderColumn(t('movers.gainers'), data.gainers, true)}
          {renderColumn(t('movers.losers'), data.losers, false)}
        </div>
      )}
    </section>
  );
}

// Market-wide trends card. Mirrors TopMovers but uses /api/trends (NOT scoped
// to a profile). Rows are clickable only when the item is in the user's own
// inventory — the market list may include items the user doesn't own.
function MarketTrends({ source, pp, locale, t, items, onItemClick }: {
  source: 'steam' | 'csfloat' | 'skinport';
  pp: PriceProvider;
  locale: 'fr' | 'en';
  t: (key: TranslationKey) => string;
  items: ItemGroup[];
  onItemClick: (item: ItemGroup) => void;
}) {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, isLoading } = useTrends(source, days);

  const handleRowClick = (name: string) => {
    const item = items.find((i) => i.marketHashName === name);
    if (item) onItemClick(item);
  };

  const renderColumn = (label: string, movers: Mover[], positive: boolean) => (
    <div className="min-w-0">
      <div className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${positive ? 'text-sf-green' : 'text-sf-pink'}`}>
        {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        {label}
      </div>
      {movers.length > 0 ? (
        <div className="space-y-1">
          {movers.map((m) => {
            const item = items.find((i) => i.marketHashName === m.name);
            const clickable = !!item;
            return (
              <div
                key={m.name}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => handleRowClick(m.name) : undefined}
                onKeyDown={clickable ? activationKeyDown(() => handleRowClick(m.name)) : undefined}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${clickable ? 'cursor-pointer hover:bg-white/[0.04] transition-colors' : ''}`}
              >
                <span className="text-xs text-gray-300 truncate flex-1 min-w-0">
                  {getDisplayItemName(m.name, item?.wear?.name)}
                </span>
                <span className={`font-mono text-xs shrink-0 ${positive ? 'text-sf-green' : 'text-sf-pink'}`}>
                  {formatPercent(m.changePct)}
                </span>
                <span className="font-mono text-xs text-white shrink-0 w-20 text-right">
                  {formatEur(m.newPrice, source === 'steam' ? pp : undefined)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-2.5 py-1.5 text-xs text-gray-600">{t('trends.none')}</div>
      )}
    </div>
  );

  return (
    <section className="sf-card p-6 mb-8">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <span className={SECTION_TITLE}>{t('trends.title')}</span>
        <div className="flex gap-1">
          {([7, 30] as const).map((d) => (
            <PillButton key={d} active={days === d} onClick={() => setDays(d)}>
              {locale === 'fr' ? `${d}J` : `${d}D`}
            </PillButton>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mb-4">{t('trends.caption')}</p>
      {isLoading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
      ) : data.gainers.length === 0 && data.losers.length === 0 ? (
        <div className="py-6 text-center">
          <Activity className="w-10 h-10 text-sf-dim mx-auto mb-3" />
          <p className="text-sm font-semibold text-white mb-1">{t('trends.none')}</p>
          <p className="text-xs text-gray-500">{t('trends.noneDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {renderColumn(t('movers.gainers'), data.gainers, true)}
          {renderColumn(t('movers.losers'), data.losers, false)}
        </div>
      )}
    </section>
  );
}

function AssetRow({ item, pp, compact = false, onClick }: { item: ItemGroup; pp: PriceProvider; compact?: boolean; onClick: () => void }) {
  const displayName = getDisplayItemName(item.marketHashName, item.wear?.name);
  const tag = weaponTag(displayName);
  // Shared P&L basis: net-of-fees in steam_fees mode, stickers included.
  const rowPnl = item.buyPrice != null ? (applyFees(item.total, pp) ?? 0) - item.buyPrice * item.quantity : null;
  // Subtle indicator when this item has a notable (gold/cyan) rare-pattern tag.
  const patternTags = detectPatterns({ marketHashName: item.marketHashName, floatValue: item.floatValue, paintSeed: item.paintSeed });
  const notableTier = patternTags.find((p) => p.tier === 'gold')
    ? 'gold'
    : patternTags.find((p) => p.tier === 'cyan')
      ? 'cyan'
      : null;

  return (
    <div
      className={`asset-row ${compact ? 'asset-row--compact [content-visibility:auto] [contain-intrinsic-size:auto_56px]' : '[content-visibility:auto] [contain-intrinsic-size:auto_72px]'}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={activationKeyDown(onClick)}
      style={{ borderLeftColor: item.rarity.color, '--rarity': item.rarity.color } as React.CSSProperties}
    >
      <div className="asset-cell asset-cell--qty">
        {item.quantity > 1 ? (
          <span className="font-mono text-base font-bold text-white/80">
            {`x${item.quantity}`}
          </span>
        ) : (
          <span className="font-mono text-base text-white/20" aria-hidden="true">{'–'}</span>
        )}
      </div>

      <div className="asset-cell asset-cell--image">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.marketHashName} loading="lazy" decoding="async" className="w-11 h-11 sm:w-[76px] sm:h-[76px] rounded-lg object-contain" />
        ) : (
          <div className="w-11 h-11 sm:w-[76px] sm:h-[76px] rounded-lg bg-white/[0.03] flex items-center justify-center text-xs font-semibold text-gray-500">
            {tag || 'Item'}
          </div>
        )}
      </div>

      <div className="asset-cell asset-cell--name min-w-0 overflow-hidden">
        <div className="font-semibold text-[13px] truncate text-white">
          {notableTier && (
            <span
              className="mr-1 text-[11px] align-middle"
              style={{ color: notableTier === 'gold' ? '#f0b90b' : 'var(--accent)' }}
              title="Pattern notable"
              aria-hidden="true"
            >
              {'♦'}
            </span>
          )}
          {displayName}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {/* The dedicated qty cell is hidden on mobile; surface quantity here instead. */}
          {item.quantity > 1 && (
            <span className="sm:hidden inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/[0.08] text-white/80">
              x{item.quantity}
            </span>
          )}
          {item.wear && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ color: item.wear.color, background: `${item.wear.color}18` }}>
              {item.wear.name}
            </span>
          )}
          {!item.wear && (
            <span
              className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold"
              style={{ color: item.rarity.color, background: item.rarity.bg }}
            >
              {item.rarity.name}
            </span>
          )}
          {item.floatValue !== null && (
            <span className="text-[10px] text-gray-500 font-mono">{item.floatValue.toFixed(4)}</span>
          )}
        </div>
      </div>

      <div className="asset-cell asset-cell--price">
        <span className="font-mono text-right font-bold text-base">{formatEur(item.price, pp)}</span>
      </div>

      <div className="asset-cell asset-cell--total">
        <div className="flex flex-col items-end gap-0.5">
          <span className={`font-mono text-xs text-right ${item.quantity > 1 && item.total > 0 ? 'text-sf-green' : 'text-gray-600'}`}>
            {item.quantity > 1 ? formatEur(item.total, pp) : '-'}
          </span>
          {rowPnl !== null && (
            <span className={`font-mono text-[10px] text-right ${rowPnl >= 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
              {rowPnl >= 0 ? '+' : ''}{formatEur(rowPnl)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StorageSection({ unit, pp, valueRatio = 0, onItemClick }: { unit: StorageUnit; pp: PriceProvider; valueRatio?: number; onItemClick: (item: ItemGroup) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sf-card overflow-hidden">
      <div
        className="p-5 pb-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={activationKeyDown(() => setOpen(!open))}
      >
        <div className="flex items-center gap-4">
          {unit.imageUrl ? (
            <img src={unit.imageUrl} alt="" className="w-12 h-12 rounded-lg object-contain" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-sf-purple/10 border border-sf-purple/20 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-sf-purple" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <p className="font-semibold text-sm">{unit.name}</p>
              <span className="font-mono text-base font-bold text-gray-400">{unit.itemCount}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono font-bold text-sf-cyan text-base">{formatEur(unit.totalValue, pp)}</span>
          <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${open ? '' : '-rotate-90'}`} />
        </div>
      </div>
      {/* Value bar: this unit's worth relative to the most valuable unit */}
      <div className="mx-5 mb-4 h-[2px] rounded-full bg-white/[0.05]" aria-hidden="true">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(1, valueRatio)) * 100}%`,
            background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 25%, transparent), var(--accent))',
          }}
        />
      </div>
      {open && (
        <div className="border-t border-white/[0.06] px-4 pb-4 space-y-1 pt-3">
          {unit.items.map((item) => (
            <AssetRow key={item.marketHashName} item={item} pp={pp} onClick={() => onItemClick(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
