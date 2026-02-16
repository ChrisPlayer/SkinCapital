import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import {
  useDashboardData,
  useRefreshInventory,
  useRefreshPrices,
  useCancelPriceRefresh,
} from '../../hooks/useApi.ts';
import { useRefreshPolling } from '../../hooks/usePolling.ts';
import { useI18n, type PriceProvider } from '../../lib/i18n.tsx';
import { formatEur, formatPercent, formatDate } from '../../lib/formatters.ts';
import { getDisplayItemName } from '../../lib/item-display.ts';
import { ItemDetailModal } from '../inventory/ItemDetailModal.tsx';
import { ItemCard } from '../inventory/ItemCard.tsx';
import { api } from '../../lib/api-client.ts';
import {
  LayoutDashboard, Package, FolderOpen, LogOut, Users,
  RefreshCw, Loader2, LogIn, Download, Search, ChevronDown,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  Activity, DollarSign, Settings, LayoutGrid, List, X,
} from 'lucide-react';
import type { ItemGroup, StorageUnit } from '../../../shared/types/inventory.ts';
import type { HistoryPoint } from '../../../shared/types/api.ts';

type View = 'dashboard' | 'inventory' | 'storage';

// ── Helpers ──

function chartPath(data: HistoryPoint[], w: number, h: number) {
  if (data.length < 2) return { line: '', fill: '' };
  const vals = data.map((d) => d.value);
  const mn = Math.min(...vals) * 0.95;
  const mx = Math.max(...vals) * 1.05;
  const rng = mx - mn || 1;
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((d.value - mn) / rng) * h * 0.88 - h * 0.06,
  }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return { line, fill: `${line} L${w},${h} L0,${h} Z` };
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

// ── Main Component ──

export function DashboardPage() {
  const { steamId } = useParams<{ steamId: string }>();
  const navigate = useNavigate();
  const { status, logout } = useAuth();
  const { t, locale, priceProvider } = useI18n();
  const pp = priceProvider;
  const priceSource: 'steam' | 'csfloat' = priceProvider === 'csfloat' ? 'csfloat' : 'steam';
  const [view, setView] = useState<View>('dashboard');
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'price' | 'name' | 'float' | 'quantity'>('price');
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<ItemGroup | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [includeStorage, setIncludeStorage] = useState(false);
  const [showFeed, setShowFeed] = useState(true);
  const { isRefreshing, syncType, source: activeRefreshSource, lastRefresh, progress } = useRefreshPolling(
    steamId,
    priceSource,
  );
  const { data, isLoading } = useDashboardData(steamId!, days, priceSource, isRefreshing);
  const refreshMutation = useRefreshInventory();
  const refreshPricesMutation = useRefreshPrices();
  const cancelPriceRefreshMutation = useCancelPriceRefresh();

  const isOwner = status?.isLoggedIn && status?.steamId === steamId;
  const previousPriceSourceRef = useRef<'steam' | 'csfloat'>(priceSource);

  useEffect(() => {
    const previousSource = previousPriceSourceRef.current;
    if (steamId && previousSource !== priceSource) {
      // Steam + Steam fees share source "steam", so no cancel in this switch.
      cancelPriceRefreshMutation.mutate(steamId);
    }
    previousPriceSourceRef.current = priceSource;
  }, [steamId, priceSource, cancelPriceRefreshMutation]);

  if (!steamId) { navigate('/'); return null; }

  if (isLoading || !data) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#050506]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-sf-cyan mx-auto mb-4" />
          <p className="text-sm text-gray-500">{t('loading.data')}</p>
        </div>
      </div>
    );
  }

  const chart = chartPath(data.historyData, 400, 150);
  const countFormatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US');
  const formatCount = (value: number) => countFormatter.format(value);
  const totalStorageUnits = data.storageUnits.length + data.emptyStorageUnits;

  const navItems: { id: View; icon: typeof LayoutDashboard; label: string }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { id: 'inventory', icon: Package, label: `${t('nav.inventory')} (${formatCount(data.totalItems)})` },
    { id: 'storage', icon: FolderOpen, label: `${t('nav.storageUnits')} (${formatCount(totalStorageUnits)})` },
  ];

  const switchView = (v: View) => { setView(v); setSearch(''); setPage(1); };

  const filterSort = (items: ItemGroup[]) => {
    let r = items;
    if (search) { const q = search.toLowerCase(); r = r.filter((i) => i.marketHashName.toLowerCase().includes(q)); }
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
  };

  const listItems = view === 'inventory' ? (includeStorage ? data.items : data.mainInventory.items) : [];
  const filtered = filterSort(listItems);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const inventoryTotal = includeStorage ? data.totalValue : data.mainInventory.total;

  const handleRefreshInventory = () => { if (isOwner) refreshMutation.mutate(); else navigate('/login'); };
  const handleRefreshPrices = () => {
    if (steamId) {
      refreshPricesMutation.mutate({ steamId, source: priceSource, scope: 'stale_or_missing' });
    }
  };
  const handleRefreshMissingPrices = () => {
    if (steamId) {
      refreshPricesMutation.mutate({ steamId, source: priceSource, scope: 'missing' });
    }
  };
  const handleCancelPriceRefresh = () => {
    if (steamId) {
      cancelPriceRefreshMutation.mutate(steamId);
    }
  };
  const handleLogout = async () => { await logout.mutateAsync(); };

  const feedCols = showFeed ? 'xl:grid-cols-[260px_1fr_380px]' : 'xl:grid-cols-[260px_1fr]';
  const isPriceRefreshForCurrentSource = syncType === 'prices' && activeRefreshSource === priceSource;
  const syncProgressText = progress && progress.total > 0
    ? ` (${progress.fetched}/${progress.total})`
    : '';
  const syncSourceText = syncType === 'prices'
    ? ` - ${activeRefreshSource === 'csfloat' ? 'CSFloat' : activeRefreshSource === 'steam' ? 'Steam' : '...'}`
    : '';

  return (
    <>
      <div className={`h-screen grid grid-cols-1 md:grid-cols-[260px_1fr] ${feedCols} overflow-hidden`}>

        {/* ═══ SIDEBAR ═══ */}
        <aside className="sf-sidebar hidden md:flex flex-col py-8 px-6">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-1 h-6 rounded-full bg-sf-cyan" />
            <span className="text-xl font-bold">SkinCapital</span>
          </div>

          <span className="nav-label mb-3">{t('nav.terminal')}</span>
          <nav className="space-y-1 mb-8">
            {navItems.map((n) => (
              <button key={n.id} className={`sf-nav-item ${view === n.id ? 'active' : ''}`} onClick={() => switchView(n.id)}>
                <n.icon className="w-4 h-4" /> {n.label}
              </button>
            ))}
          </nav>

          <span className="nav-label mb-3">{t('nav.account')}</span>
          <nav className="space-y-1">
            <button className="sf-nav-item" onClick={() => navigate('/')}>
              <Users className="w-4 h-4" /> {t('nav.profiles')}
            </button>
            <button className="sf-nav-item" onClick={() => navigate(steamId ? `/settings/${steamId}` : '/settings')}>
              <Settings className="w-4 h-4" /> {t('nav.settings')}
            </button>
            {isOwner && (
              <button className="sf-nav-item" onClick={handleLogout}>
                <LogOut className="w-4 h-4" /> {t('nav.logout')}
              </button>
            )}
          </nav>

          <div className="mt-auto p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="text-xs text-gray-500 mb-1">{t('dashboard.netValuation')}</div>
            <div className="font-mono text-2xl font-bold">{formatEur(data.totalValue, pp)}</div>
            {data.change24h.hasData && (
              <div className={`font-mono text-xs mt-1 ${data.change24h.percentage >= 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
                {formatPercent(data.change24h.percentage)} (24H)
              </div>
            )}
          </div>
        </aside>

        {/* ═══ MAIN ═══ */}
        <main className="overflow-y-auto px-5 py-8 xl:px-10 relative">
          <div className="grid-overlay" />

          {/* Mobile nav */}
          <div className="md:hidden flex items-center gap-3 mb-4 relative z-10">
            <button onClick={() => navigate('/')} className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
            <span className="font-bold text-lg">SkinCapital</span>
          </div>
          <div className="md:hidden flex gap-1.5 mb-6 overflow-x-auto relative z-10 pb-1">
            {navItems.map((n) => (
              <button key={n.id} onClick={() => switchView(n.id)} className={`sf-tag whitespace-nowrap ${view === n.id ? 'bg-sf-cyan/10 text-sf-cyan border border-sf-cyan/20' : ''}`}>
                {n.label}
              </button>
            ))}
          </div>

          {/* Header */}
          <header className="hidden md:flex flex-wrap justify-between items-center mb-8 relative z-10 gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-0.5">
                {view === 'dashboard' && t('dashboard.marketOverview')}
                {view === 'inventory' && t('dashboard.inventory')}
                {view === 'storage' && t('dashboard.storageUnits')}
              </h1>
              <span className="text-xs text-gray-500">{steamId}</span>
            </div>
            <div className="flex items-center gap-2">
              {isRefreshing ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sf-cyan/10 border border-sf-cyan/20">
                    <Loader2 className="w-4 h-4 animate-spin text-sf-cyan" />
                    <span className="text-xs text-sf-cyan">{t('dashboard.syncing')}{syncSourceText}{syncProgressText}</span>
                  </div>
                  {syncType === 'prices' && (
                    <button
                      onClick={handleCancelPriceRefresh}
                      disabled={cancelPriceRefreshMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors text-xs text-gray-300 hover:text-white disabled:opacity-60"
                    >
                      <X className="w-3.5 h-3.5" />
                      {locale === 'fr' ? 'Annuler' : 'Cancel'}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <button
                    onClick={handleRefreshPrices}
                    disabled={refreshPricesMutation.isPending || isPriceRefreshForCurrentSource}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors text-sm text-gray-300 hover:text-white disabled:opacity-60"
                    title={t('dashboard.refreshPricesTooltip')}
                  >
                    <DollarSign className="w-4 h-4" />
                    <span className="hidden lg:inline">{t('dashboard.refreshPrices')}</span>
                  </button>
                  <button onClick={handleRefreshInventory} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors text-sm text-gray-300 hover:text-white" title={t('dashboard.refreshInventoryTooltip')}>
                    {isOwner ? <RefreshCw className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                    <span className="hidden lg:inline">{isOwner ? t('dashboard.refreshInventory') : t('auth.login')}</span>
                  </button>
                </>
              )}
              {isOwner ? (
                <a href={api.export.csvUrl(steamId!)} download className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors">
                  <Download className="w-4 h-4 text-gray-400" />
                </a>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
                  title={t('auth.login')}
                >
                  <Download className="w-4 h-4 text-gray-400" />
                </button>
              )}
              {data.priceWindow && (
                <span className="sf-tag text-gray-400" title={t('dashboard.priceWindowTooltip')}>
                  {formatPriceWindow(data.priceWindow, locale)}
                </span>
              )}
            </div>
          </header>

          {/* ── CONTENT ── */}
          <div className="relative z-10">
            {/* DASHBOARD */}
            {view === 'dashboard' && (
              <>
                <section className="sf-card p-6 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 mb-8">
                  <div>
                    <div className="text-sm font-semibold text-gray-400 mb-2">{t('dashboard.portfolioPerformance')}</div>
                    <div className="text-4xl font-bold mb-1">
                      {formatEur(data.totalValue, pp)}
                      {data.change24h.hasData && (
                        <span className={`text-base font-normal ml-3 ${data.change24h.change >= 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
                          {data.change24h.change >= 0 ? '+' : ''}{formatEur(data.change24h.change, pp)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <div><div className="text-xs text-gray-500 mb-1">{t('dashboard.totalItems')}</div><div className="font-mono text-lg">{data.totalItems}</div></div>
                      <div><div className="text-xs text-gray-500 mb-1">{t('nav.storageUnits')}</div><div className="font-mono text-lg text-sf-purple">{data.storageUnits.length}</div></div>
                      <div><div className="text-xs text-gray-500 mb-1">{t('dashboard.uniqueItems')}</div><div className="font-mono text-lg">{data.uniqueItems}</div></div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">{t('dashboard.var24h')}</div>
                        <div className={`font-mono text-lg ${data.change24h.hasData ? (data.change24h.percentage >= 0 ? 'text-sf-green' : 'text-sf-pink') : 'text-gray-600'}`}>
                          {data.change24h.hasData ? formatPercent(data.change24h.percentage) : '\u2014'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-44 flex items-end">
                    {chart.line ? (
                      <svg viewBox="0 0 400 150" className="w-full h-full">
                        <defs>
                          <linearGradient id="sfCG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(0,204,255,0.15)" />
                            <stop offset="100%" stopColor="rgba(0,204,255,0)" />
                          </linearGradient>
                        </defs>
                        <path d={chart.fill} fill="url(#sfCG)" />
                        <path d={chart.line} fill="none" stroke="#00ccff" strokeWidth="2.5" />
                      </svg>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">{t('dashboard.noChartData')}</div>
                    )}
                  </div>
                </section>

                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-gray-400">{t('dashboard.topAssets')}</span>
                  <div className="flex gap-1">
                    {[7, 30, 90].map((d) => (
                      <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs transition-all ${days === d ? 'bg-sf-cyan/20 text-sf-cyan' : 'text-gray-500 hover:text-gray-300'}`}>{d}J</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {data.items.slice(0, 8).map((item) => (
                    <AssetRow key={item.marketHashName} item={item} pp={pp} onClick={() => setSelectedItem(item)} />
                  ))}
                </div>
              </>
            )}

            {/* INVENTORY */}
            {view === 'inventory' && (
              <>
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      placeholder={t('search.placeholder')}
                      className="w-full h-10 pl-10 pr-4 rounded-xl bg-sf-card border border-white/[0.08] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-sf-cyan/30"
                    />
                  </div>
                  <div className="h-10 min-w-[190px] rounded-xl border border-white/[0.08] bg-sf-card px-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">{t('sort.by')}</span>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as typeof sort)}
                      className="h-full flex-1 bg-transparent text-sm text-white focus:outline-none"
                    >
                      <option value="price">{t('sort.price')}</option>
                      <option value="quantity">{t('sort.quantity')}</option>
                      <option value="name">{t('sort.name')}</option>
                      <option value="float">{t('sort.float')}</option>
                    </select>
                  </div>
                  <div className="flex rounded-xl border border-white/[0.08] overflow-hidden">
                    <button onClick={() => setViewMode('list')} className={`w-10 h-10 flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-sf-cyan/20 text-sf-cyan' : 'bg-sf-card text-gray-500 hover:text-white'}`} title={t('view.list')}><List className="w-4 h-4" /></button>
                    <button onClick={() => setViewMode('cards')} className={`w-10 h-10 flex items-center justify-center transition-colors ${viewMode === 'cards' ? 'bg-sf-cyan/20 text-sf-cyan' : 'bg-sf-card text-gray-500 hover:text-white'}`} title={t('view.cards')}><LayoutGrid className="w-4 h-4" /></button>
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

                {viewMode === 'list' ? (
                  <div className="space-y-1">
                    {paginated.map((item) => (
                      <AssetRow key={item.marketHashName} item={item} pp={pp} onClick={() => setSelectedItem(item)} />
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
                  <div className="sf-card p-8 text-center text-sm text-gray-500">{t('empty.noResults')}</div>
                )}

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                      return p <= totalPages ? <button key={p} onClick={() => setPage(p)} className={`w-9 h-9 rounded-lg text-xs ${p === page ? 'bg-sf-cyan text-white' : 'bg-white/5 hover:bg-white/10'}`}>{p}</button> : null;
                    })}
                    <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                )}
              </>
            )}

            {/* STORAGE */}
            {view === 'storage' && (
              <div className="space-y-4">
                {data.storageUnits.length === 0 && data.emptyStorageUnits === 0 ? (
                  <div className="sf-card p-8 text-center text-sm text-gray-500">{t('empty.noStorageUnits')}</div>
                ) : (
                  <>
                    {data.storageUnits.map((unit) => (
                      <StorageSection key={unit.casketId} unit={unit} pp={pp} onItemClick={setSelectedItem} />
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
          </div>
        </main>

        {/* ═══ ACTIVITY FEED ═══ */}
        {showFeed && (
          <aside className="sf-feed hidden xl:block overflow-y-auto px-6 py-8">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-semibold text-gray-300">Activity</span>
              <button onClick={() => setShowFeed(false)} className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <ActivityFeed
              data={data}
              pp={pp}
              locale={locale}
              isRefreshing={isRefreshing}
              syncType={syncType}
              source={activeRefreshSource}
              selectedPriceSource={priceSource}
              lastRefresh={lastRefresh}
              progress={progress}
              onRefreshPrices={handleRefreshPrices}
              onRefreshMissingPrices={handleRefreshMissingPrices}
              onCancelPriceRefresh={handleCancelPriceRefresh}
              isRefreshPricesPending={refreshPricesMutation.isPending || isPriceRefreshForCurrentSource}
              isCancelPriceRefreshPending={cancelPriceRefreshMutation.isPending}
            />
          </aside>
        )}
        {!showFeed && (
          <button
            onClick={() => setShowFeed(true)}
            className="hidden xl:flex fixed right-0 top-1/2 -translate-y-1/2 w-8 h-16 rounded-l-lg bg-white/[0.06] hover:bg-white/[0.10] items-center justify-center transition-colors z-50"
            title="Show panel"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      <ItemDetailModal item={selectedItem} open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }} />
    </>
  );
}

// ── Sub-Components ──

function AssetRow({ item, pp, onClick }: { item: ItemGroup; pp: PriceProvider; onClick: () => void }) {
  const displayName = getDisplayItemName(item.marketHashName, item.wear?.name);
  const tag = weaponTag(displayName);

  return (
    <div className="asset-row" onClick={onClick} style={{ borderLeftColor: item.rarity.color }}>
      <div className="asset-cell asset-cell--qty">
        <span className="font-mono text-base font-bold text-white/80">
          {`x${item.quantity}`}
        </span>
      </div>

      <div className="asset-cell asset-cell--image">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="w-[76px] h-[76px] rounded-lg object-contain" />
        ) : (
          <div className="w-[76px] h-[76px] rounded-lg bg-white/[0.03] flex items-center justify-center text-xs font-semibold text-gray-500">
            {tag || 'Item'}
          </div>
        )}
      </div>

      <div className="asset-cell asset-cell--name min-w-0 overflow-hidden">
        <div className="font-semibold text-[13px] truncate text-white">{displayName}</div>
        <div className="flex items-center gap-2 mt-0.5">
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
        <span className={`font-mono text-xs text-right ${item.quantity > 1 && item.total > 0 ? 'text-sf-green' : 'text-gray-600'}`}>
          {item.quantity > 1 ? formatEur(item.total, pp) : '-'}
        </span>
      </div>
    </div>
  );
}

function StorageSection({ unit, pp, onItemClick }: { unit: StorageUnit; pp: PriceProvider; onItemClick: (item: ItemGroup) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sf-card overflow-hidden">
      <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => setOpen(!open)}>
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

function ActivityFeed({
  data,
  pp,
  locale,
  isRefreshing,
  syncType,
  source,
  selectedPriceSource,
  lastRefresh,
  progress,
  onRefreshPrices,
  onRefreshMissingPrices,
  onCancelPriceRefresh,
  isRefreshPricesPending,
  isCancelPriceRefreshPending,
}: {
  data: import('../../../shared/types/api.ts').DashboardData;
  pp: PriceProvider;
  locale: 'fr' | 'en';
  isRefreshing: boolean;
  syncType: 'inventory' | 'prices' | null;
  source: 'steam' | 'csfloat' | null;
  selectedPriceSource: 'steam' | 'csfloat';
  lastRefresh: string | null;
  progress: { fetched: number; total: number } | null;
  onRefreshPrices: () => void;
  onRefreshMissingPrices: () => void;
  onCancelPriceRefresh: () => void;
  isRefreshPricesPending: boolean;
  isCancelPriceRefreshPending: boolean;
}) {
  const { t } = useI18n();
  const [showAlerts, setShowAlerts] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const countFormatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US');
  const staleHours = data.priceWindow
    ? Math.max(0, (Date.now() - new Date(data.priceWindow.to + (data.priceWindow.to.includes('Z') ? '' : 'Z')).getTime()) / (1000 * 60 * 60))
    : null;
  const pricesAreStale = staleHours !== null && staleHours >= 20;
  const syncSourceText = syncType === 'prices'
    ? ` (${source === 'csfloat' ? 'CSFloat' : source === 'steam' ? 'Steam' : '...'})`
    : '';

  const priceAlerts = data.items
    .filter((item) => item.priceChange !== null && item.priceChangePercent !== null && Math.abs(item.priceChange) >= 5 && Math.abs(item.priceChangePercent) >= 5)
    .slice(0, 6)
    .map((item) => {
      const pct = item.priceChangePercent!;
      const change = item.priceChange!;
      const isUp = change > 0;
      const isBig = Math.abs(pct) > 10;
      const alertType = isBig ? (isUp ? 'high' : 'critical') : 'notable';
      const label = isBig ? (isUp ? t('alerts.priceUp') : t('alerts.priceDown')) : (isUp ? t('alerts.moderateUp') : t('alerts.moderateDown'));
      const icon: React.ReactNode = isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />;
      const colors = {
        critical: { dot: '#ff3366', bg: 'bg-[#ff336608]', border: 'border-[#ff336618]', text: 'text-sf-pink' },
        high: { dot: '#4ADE80', bg: 'bg-[#4ADE8008]', border: 'border-[#4ADE8018]', text: 'text-sf-green' },
        notable: { dot: '#00ccff', bg: 'bg-[#00ccff08]', border: 'border-[#00ccff18]', text: 'text-sf-cyan' },
      }[alertType as string] as { dot: string; bg: string; border: string; text: string };
      return { item, label, icon, colors, change, pct };
    });

  return (
    <>
      {/* SYSTEM */}
      {(isRefreshing || lastRefresh || pricesAreStale || data.missingPrices.itemCount > 0) && (
        <div className="mb-6">
          <div className="feed-section-title mb-3">{t('feed.system')}</div>
          {isRefreshing && (
            <div className="bg-sf-card rounded-xl p-4 border border-sf-cyan/15 mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-sf-cyan mb-1">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('feed.syncingTitle')}{syncSourceText}
              </div>
              <div className="text-xs text-gray-400">
                {syncType === 'prices'
                  ? (locale === 'fr' ? 'Mise a jour des prix en cours...' : 'Price refresh in progress...')
                  : t('feed.syncingDesc')}
                {progress && progress.total > 0 ? ` (${progress.fetched}/${progress.total})` : ''}
              </div>
              {syncType === 'prices' && (
                <button
                  onClick={onCancelPriceRefresh}
                  disabled={isCancelPriceRefreshPending}
                  className="mt-3 h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-gray-300 hover:text-white hover:bg-white/[0.08] transition-colors disabled:opacity-60"
                >
                  {locale === 'fr' ? 'Annuler le refresh' : 'Cancel refresh'}
                </button>
              )}
            </div>
          )}
          {lastRefresh && !isRefreshing && (
            <div className="bg-sf-card rounded-xl p-4 border border-white/[0.06]">
              <div className="flex items-center gap-2 text-sm font-semibold text-sf-green mb-1">
                <Activity className="w-4 h-4" /> {t('feed.syncComplete')}
                <span className="text-[11px] font-mono text-gray-400">
                  ({selectedPriceSource === 'csfloat' ? 'CSFloat' : 'Steam'})
                </span>
              </div>
              <div className="text-xs text-gray-400">
                {data.totalItems} {t('feed.itemsSynced')} &middot; <span className="text-white font-mono">{formatEur(data.totalValue, pp)}</span>
              </div>
            </div>
          )}

          {pricesAreStale && (
            <div className="bg-amber-400/10 rounded-xl p-4 border border-amber-400/25 mt-3">
              <div className="text-sm font-semibold text-amber-200 mb-1">
                {locale === 'fr' ? 'Prix a rafraichir' : 'Prices need refresh'}
              </div>
              <div className="text-xs text-amber-100/80 mb-3">
                {locale === 'fr'
                  ? `Les prix datent d'environ ${Math.round(staleHours || 0)}h. Lance un refresh prix.`
                  : `Prices are about ${Math.round(staleHours || 0)}h old. Trigger a price refresh.`}
              </div>
              <button
                onClick={onRefreshPrices}
                disabled={isRefreshPricesPending}
                className="h-9 px-3 rounded-lg bg-amber-300/20 border border-amber-300/30 text-amber-100 text-xs font-semibold hover:bg-amber-300/30 transition-colors disabled:opacity-60"
              >
                {t('dashboard.refreshPrices')}
              </button>
            </div>
          )}

          {data.missingPrices.itemCount > 0 && (
            <div className="bg-amber-400/8 rounded-xl p-4 border border-amber-400/25 mt-3">
              <div className="text-sm font-semibold text-amber-200 mb-1">{t('dashboard.missingPricesTitle')}</div>
              <div className="text-xs text-amber-100/80 mb-3">
                {locale === 'fr'
                  ? `${countFormatter.format(data.missingPrices.itemCount)} items (${countFormatter.format(data.missingPrices.uniqueCount)} uniques) sans prix.`
                  : `${countFormatter.format(data.missingPrices.itemCount)} items (${countFormatter.format(data.missingPrices.uniqueCount)} unique) missing prices.`}
              </div>
              <button
                onClick={onRefreshMissingPrices}
                disabled={isRefreshPricesPending}
                className="h-9 px-3 rounded-lg bg-amber-300/20 border border-amber-300/30 text-amber-100 text-xs font-semibold hover:bg-amber-300/30 transition-colors disabled:opacity-60"
              >
                {t('dashboard.missingPricesAction')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* PRICE ALERTS */}
      <button className="feed-section-title w-full flex items-center justify-between mb-3 hover:text-white transition-colors" onClick={() => setShowAlerts(!showAlerts)}>
        <span>{t('alerts.title')}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${showAlerts ? '' : '-rotate-90'}`} />
      </button>
      {showAlerts && (
        <div className="space-y-2 mb-6">
          {priceAlerts.length > 0 ? priceAlerts.map(({ item, label, icon, colors, change, pct }, i) => (
            <div key={item.marketHashName} className={`${colors.bg} rounded-xl p-3.5 border ${colors.border}`} style={{ opacity: i > 3 ? 0.5 : 1 }}>
              <div className="flex items-center justify-between mb-1">
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${colors.text}`}>{icon} {label}</div>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-white">{formatEur(item.price, pp)}</span>
                  <span className={`font-mono text-[11px] ml-2 ${change > 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
                    {change > 0 ? '+' : ''}{formatEur(change, pp)} ({formatPercent(pct)})
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-400 truncate">{getDisplayItemName(item.marketHashName, item.wear?.name)}</div>
            </div>
          )) : (
            <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] text-sm text-gray-500">{t('alerts.noAlerts')}</div>
          )}
        </div>
      )}

      {/* DAILY HISTORY */}
      <button className="feed-section-title w-full flex items-center justify-between mb-3 hover:text-white transition-colors" onClick={() => setShowHistory(!showHistory)}>
        <span>{t('history.title')}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${showHistory ? '' : '-rotate-90'}`} />
      </button>
      {showHistory && (
        <div className="space-y-2">
          {data.dailyHistory.length > 0 ? data.dailyHistory.map((entry, i) => {
            const up = entry.change >= 0;
            return (
              <div key={i} className="bg-sf-card rounded-xl p-3.5 border border-white/[0.06]" style={{ opacity: i > 6 ? 0.4 : 1 }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-bold text-white">{formatEur(entry.value, pp)}</span>
                  <span className="text-[11px] text-gray-500">{formatDate(entry.date)}</span>
                </div>
                {entry.change !== 0 ? (
                  <div className={`flex items-center gap-1 text-xs font-mono ${up ? 'text-sf-green' : 'text-sf-pink'}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? '+' : ''}{formatEur(entry.change, pp)} ({formatPercent(entry.changePercent)})
                  </div>
                ) : (
                  <div className="text-xs text-gray-600">{t('history.noChange')}</div>
                )}
              </div>
            );
          }) : (
            <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] text-sm text-gray-500">{t('history.noHistory')}</div>
          )}
        </div>
      )}
    </>
  );
}

export default DashboardPage;
