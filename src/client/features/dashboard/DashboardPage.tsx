import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.ts';
import { useDashboardData, useRefreshInventory } from '../../hooks/useApi.ts';
import { useRefreshPolling } from '../../hooks/usePolling.ts';
import { formatEur, formatPercent, formatDate } from '../../lib/formatters.ts';
import { ItemDetailModal } from '../inventory/ItemDetailModal.tsx';
import { api } from '../../lib/api-client.ts';
import {
  LayoutDashboard, Package, FolderOpen, Eye, LogOut, Users,
  RefreshCw, Loader2, LogIn, Download, Search, ChevronDown,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, AlertTriangle,
  Gem, Crosshair, Activity,
} from 'lucide-react';
import type { ItemGroup, StorageUnit } from '../../../shared/types/inventory.ts';
import type { HistoryPoint, DailyHistoryEntry } from '../../../shared/types/api.ts';

type View = 'dashboard' | 'inventory' | 'storage' | 'overview';

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

function itemAccent(item: ItemGroup): string {
  if (item.marketHashName.includes('★')) return '#a020f0';
  if (item.rarity.name === 'StatTrak') return '#ff3366';
  if (item.rarity.name === 'Souvenir') return '#FFD700';
  return '#00ccff';
}

const PER_PAGE = 30;

// ── Main Component ──

export function DashboardPage() {
  const { steamId } = useParams<{ steamId: string }>();
  const navigate = useNavigate();
  const { status, logout } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'price' | 'name' | 'float'>('price');
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<ItemGroup | null>(null);
  const { isRefreshing, lastRefresh } = useRefreshPolling();
  const { data, isLoading } = useDashboardData(steamId!, days, isRefreshing);
  const refreshMutation = useRefreshInventory();

  const isOwner = status?.isLoggedIn && status?.steamId === steamId;

  if (!steamId) { navigate('/'); return null; }

  if (isLoading || !data) {
    return (
      <div className="h-screen flex items-center justify-center bg-sf-body">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-sf-cyan mx-auto mb-4" />
          <p className="font-mono text-sm text-sf-dim">LOADING_DATA...</p>
        </div>
      </div>
    );
  }

  const chart = chartPath(data.historyData, 400, 150);

  const navItems: { id: View; icon: typeof LayoutDashboard; label: string }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'inventory', icon: Package, label: `Inventory (${data.mainInventory.count})` },
    { id: 'storage', icon: FolderOpen, label: `Storage Units (${data.storageUnits.length})` },
    { id: 'overview', icon: Eye, label: `Overview (${data.uniqueItems})` },
  ];

  const switchView = (v: View) => { setView(v); setSearch(''); setPage(1); };

  // filtering
  const filterSort = (items: ItemGroup[]) => {
    let r = items;
    if (search) { const q = search.toLowerCase(); r = r.filter((i) => i.marketHashName.toLowerCase().includes(q)); }
    if (sort === 'name') r = [...r].sort((a, b) => a.marketHashName.localeCompare(b.marketHashName));
    else if (sort === 'float') r = [...r].sort((a, b) => (a.floatValue ?? 1) - (b.floatValue ?? 1));
    else r = [...r].sort((a, b) => b.total - a.total);
    return r;
  };

  const listItems = view === 'inventory' ? data.mainInventory.items : view === 'overview' ? data.items : [];
  const filtered = filterSort(listItems);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleRefresh = () => { if (isOwner) refreshMutation.mutate(); else navigate('/login'); };
  const handleLogout = async () => { await logout.mutateAsync(); };

  return (
    <>
      <div className="h-screen grid grid-cols-1 md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_340px] overflow-hidden">

        {/* ═══════ SIDEBAR ═══════ */}
        <aside className="sf-sidebar hidden md:flex flex-col py-8 px-6">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-1 h-6 rounded-full bg-sf-cyan shadow-[0_0_10px_#00ccff]" />
            <span className="font-display text-[22px] font-bold">SkinCapital</span>
          </div>

          <span className="nav-label mb-4">Terminal</span>
          <nav className="space-y-1 mb-10">
            {navItems.map((n) => (
              <button key={n.id} className={`sf-nav-item ${view === n.id ? 'active' : ''}`} onClick={() => switchView(n.id)}>
                <n.icon className="w-4 h-4" /> {n.label}
              </button>
            ))}
          </nav>

          <span className="nav-label mb-4">Account</span>
          <nav className="space-y-1">
            <button className="sf-nav-item" onClick={() => navigate('/')}>
              <Users className="w-4 h-4" /> Profils
            </button>
            {isOwner && (
              <button className="sf-nav-item" onClick={handleLogout}>
                <LogOut className="w-4 h-4" /> Deconnexion
              </button>
            )}
          </nav>

          <div className="mt-auto p-5 rounded-xl border border-dashed border-sf-cyan/20 bg-sf-cyan/[0.03]">
            <div className="nav-label mb-1">NET_VALUATION</div>
            <div className="font-mono text-xl font-bold">{formatEur(data.totalValue)}</div>
            {data.change24h.hasData && (
              <div className={`font-mono text-xs mt-1 ${data.change24h.percentage >= 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
                {formatPercent(data.change24h.percentage)} (24H)
              </div>
            )}
          </div>
        </aside>

        {/* ═══════ MAIN STAGE ═══════ */}
        <main className="overflow-y-auto px-5 py-8 xl:px-10 relative">
          <div className="grid-overlay" />

          {/* Mobile nav */}
          <div className="md:hidden flex items-center gap-3 mb-4 relative z-10">
            <button onClick={() => navigate('/')} className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
            <span className="font-display font-bold text-lg">SkinCapital</span>
          </div>
          <div className="md:hidden flex gap-1.5 mb-6 overflow-x-auto relative z-10 pb-1">
            {navItems.map((n) => (
              <button key={n.id} onClick={() => switchView(n.id)} className={`sf-tag whitespace-nowrap ${view === n.id ? 'bg-sf-cyan/10 text-sf-cyan border border-sf-cyan/20' : ''}`}>
                {n.label}
              </button>
            ))}
          </div>

          {/* Header */}
          <header className="hidden md:flex flex-wrap justify-between items-end mb-10 relative z-10 gap-4">
            <div>
              <h1 className="font-display text-3xl font-bold mb-1">
                {view === 'dashboard' && 'Market Overview'}
                {view === 'inventory' && 'Inventory'}
                {view === 'storage' && 'Storage Units'}
                {view === 'overview' && 'All Assets'}
              </h1>
              <span className="font-mono text-xs text-sf-dim">USER_SESSION // {steamId}</span>
            </div>
            <div className="flex items-center gap-2">
              {isRefreshing ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sf-cyan/10 border border-sf-cyan/20">
                  <Loader2 className="w-3 h-3 animate-spin text-sf-cyan" />
                  <span className="font-mono text-[10px] text-sf-cyan uppercase">Syncing</span>
                </div>
              ) : (
                <button onClick={handleRefresh} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors font-mono text-[10px] uppercase text-sf-secondary hover:text-white">
                  {isOwner ? <RefreshCw className="w-3 h-3" /> : <LogIn className="w-3 h-3" />}
                  {isOwner ? 'Refresh' : 'Login'}
                </button>
              )}
              <a href={api.export.csvUrl(steamId!)} download className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                <Download className="w-3 h-3 text-sf-secondary" />
              </a>
              <span className="sf-tag text-sf-dim">{new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
          </header>

          {/* ── CONTENT ── */}
          <div className="relative z-10">

            {/* ─── DASHBOARD VIEW ─── */}
            {view === 'dashboard' && (
              <>
                <section className="sf-card p-6 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 mb-8">
                  <div>
                    <div className="nav-label mb-2">PORTFOLIO_PERFORMANCE</div>
                    <div className="text-3xl font-bold mb-1">
                      {formatEur(data.totalValue)}
                      {data.change24h.hasData && (
                        <span className={`text-sm font-normal ml-3 ${data.change24h.change >= 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
                          {data.change24h.change >= 0 ? '+' : ''}{formatEur(data.change24h.change)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <div><div className="nav-label mb-1">Total Items</div><div className="font-mono text-base">{data.totalItems}</div></div>
                      <div><div className="nav-label mb-1">Storage Units</div><div className="font-mono text-base text-sf-purple">{data.storageUnits.length}</div></div>
                      <div><div className="nav-label mb-1">Unique Items</div><div className="font-mono text-base">{data.uniqueItems}</div></div>
                      <div>
                        <div className="nav-label mb-1">Var. 24h</div>
                        <div className={`font-mono text-base ${data.change24h.hasData ? (data.change24h.percentage >= 0 ? 'text-sf-green' : 'text-sf-pink') : 'text-sf-dim'}`}>
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
                            <stop offset="0%" stopColor="rgba(0,204,255,0.2)" />
                            <stop offset="100%" stopColor="rgba(0,204,255,0)" />
                          </linearGradient>
                        </defs>
                        <path d={chart.fill} fill="url(#sfCG)" />
                        <path d={chart.line} fill="none" stroke="#00ccff" strokeWidth="3" style={{ filter: 'drop-shadow(0 0 8px rgba(0,204,255,0.5))' }} />
                      </svg>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sf-dim font-mono text-xs">NO_CHART_DATA</div>
                    )}
                  </div>
                </section>

                <div className="flex items-center justify-between mb-4">
                  <span className="nav-label">Top Assets</span>
                  <div className="flex gap-1">
                    {[7, 30, 90].map((d) => (
                      <button key={d} onClick={() => setDays(d)} className={`px-3 py-1 rounded-lg font-mono text-xs transition-all ${days === d ? 'bg-sf-cyan/20 text-sf-cyan' : 'text-sf-dim hover:text-sf-secondary'}`}>{d}J</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  {data.items.slice(0, 8).map((item) => (
                    <AssetRow key={item.marketHashName} item={item} onClick={() => setSelectedItem(item)} />
                  ))}
                </div>
              </>
            )}

            {/* ─── INVENTORY / OVERVIEW VIEW ─── */}
            {(view === 'inventory' || view === 'overview') && (
              <>
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-4 h-4 text-sf-dim absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      placeholder="Search..."
                      className="w-full h-10 pl-10 pr-4 rounded-xl bg-sf-card border border-white/[0.08] text-sm text-white placeholder:text-sf-dim focus:outline-none focus:border-sf-cyan/40"
                    />
                  </div>
                  <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-10 rounded-xl border border-white/[0.08] bg-sf-card px-3 text-sm text-white">
                    <option value="price">Prix</option>
                    <option value="name">Nom</option>
                    <option value="float">Float</option>
                  </select>
                  <span className="ml-auto font-mono text-sm text-sf-cyan font-bold">
                    {formatEur(view === 'inventory' ? data.mainInventory.total : data.totalValue)}
                  </span>
                </div>

                <div className="space-y-2">
                  {paginated.map((item) => (
                    <AssetRow key={item.marketHashName} item={item} onClick={() => setSelectedItem(item)} />
                  ))}
                </div>

                {filtered.length === 0 && (
                  <div className="sf-card p-8 text-center font-mono text-sm text-sf-dim">NO_RESULTS_FOUND</div>
                )}

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-30">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                      return p <= totalPages ? (
                        <button key={p} onClick={() => setPage(p)} className={`w-9 h-9 rounded-lg font-mono text-xs ${p === page ? 'bg-sf-cyan text-white' : 'bg-white/5 hover:bg-white/10'}`}>{p}</button>
                      ) : null;
                    })}
                    <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-30">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ─── STORAGE VIEW ─── */}
            {view === 'storage' && (
              <div className="space-y-4">
                {data.storageUnits.length === 0 ? (
                  <div className="sf-card p-8 text-center font-mono text-sm text-sf-dim">NO_STORAGE_UNITS</div>
                ) : data.storageUnits.map((unit) => (
                  <StorageSection key={unit.casketId} unit={unit} onItemClick={setSelectedItem} />
                ))}
              </div>
            )}
          </div>
        </main>

        {/* ═══════ ACTIVITY FEED ═══════ */}
        <aside className="sf-feed hidden xl:block overflow-y-auto px-6 py-10">
          <ActivityFeed data={data} isRefreshing={isRefreshing} lastRefresh={lastRefresh} /></aside>
      </div>

      <ItemDetailModal item={selectedItem} open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }} />
    </>
  );
}

// ── Sub-Components ──

function AssetRow({ item, onClick }: { item: ItemGroup; onClick: () => void }) {
  const accent = itemAccent(item);
  const tag = weaponTag(item.marketHashName);
  const sub = item.wear ? `${item.wear.name} // ${item.floatValue?.toFixed(4)}` : item.rarity.name;

  return (
    <div className="asset-row" onClick={onClick}>
      <div className="w-10 h-10 rounded-lg bg-[#1c1d24] flex items-center justify-center font-mono text-[11px] font-bold" style={{ color: accent, border: `1px solid ${accent}33` }}>
        {tag}
      </div>
      <div className="pl-3 min-w-0">
        <div className="font-semibold text-[14px] truncate">{item.marketHashName}</div>
        <div className="text-xs text-sf-secondary mt-0.5 truncate">{sub}{item.quantity > 1 ? ` // x${item.quantity}` : ''}</div>
      </div>
      <div className="font-mono text-right font-medium text-sm">{formatEur(item.price)}</div>
      <div className={`font-mono text-xs text-right ${item.total > 0 ? 'text-sf-green' : 'text-sf-dim'}`}>
        {item.quantity > 1 ? formatEur(item.total) : ''}
      </div>
    </div>
  );
}

function StorageSection({ unit, onItemClick }: { unit: StorageUnit; onItemClick: (item: ItemGroup) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sf-card overflow-hidden">
      <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-sf-purple/10 border border-sf-purple/20 flex items-center justify-center">
            <FolderOpen className="w-5 h-5 text-sf-purple" />
          </div>
          <div>
            <p className="font-semibold text-sm">{unit.name}</p>
            <p className="text-xs text-sf-secondary font-mono mt-0.5">...{unit.shortId} // {unit.itemCount} items</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono font-bold text-sf-cyan text-sm">{formatEur(unit.totalValue)}</span>
          <ChevronDown className={`w-4 h-4 text-sf-dim transition-transform ${open ? '' : '-rotate-90'}`} />
        </div>
      </div>
      {open && (
        <div className="border-t border-white/[0.08] px-4 pb-4 space-y-2 pt-3">
          {unit.items.map((item) => (
            <AssetRow key={item.marketHashName} item={item} onClick={() => onItemClick(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityFeed({ data, isRefreshing, lastRefresh }: { data: import('../../../shared/types/api.ts').DashboardData; isRefreshing: boolean; lastRefresh: string | null }) {
  // Generate price alerts from top items
  const priceAlerts = data.items.slice(0, 6).map((item) => {
    const isKnife = item.marketHashName.includes('★');
    const isGloves = item.marketHashName.includes('Gloves') || item.marketHashName.includes('Wraps');
    const tag = weaponTag(item.marketHashName);
    let alertType: 'critical' | 'high' | 'notable' = 'notable';
    let label = 'Asset Tracked';
    let icon = <Crosshair className="w-3.5 h-3.5" />;

    if (item.price && item.price >= 500) {
      alertType = 'critical';
      label = 'High Value Asset';
      icon = <AlertTriangle className="w-3.5 h-3.5" />;
    } else if (isKnife || isGloves || (item.price && item.price >= 100)) {
      alertType = 'high';
      label = isKnife ? 'Knife Detected' : isGloves ? 'Gloves Detected' : 'Valuable Item';
      icon = <Gem className="w-3.5 h-3.5" />;
    }

    const colors = {
      critical: { dot: '#ff3366', bg: 'bg-sf-pink/5', border: 'border-sf-pink/15', text: 'text-sf-pink' },
      high: { dot: '#a020f0', bg: 'bg-sf-purple/5', border: 'border-sf-purple/15', text: 'text-sf-purple' },
      notable: { dot: '#00ccff', bg: 'bg-sf-cyan/5', border: 'border-sf-cyan/15', text: 'text-sf-cyan' },
    }[alertType];

    return { item, tag, label, icon, colors };
  });

  return (
    <>
      {/* ── SYSTEM STATUS ── */}
      {(isRefreshing || lastRefresh) && (
        <>
          <h3 className="nav-label mb-4">System</h3>
          <div className="relative pl-8 mb-8">
            <div className="timeline-line" />
            {isRefreshing && (
              <div className="relative mb-6">
                <div className="timeline-dot" style={{ borderColor: '#00ccff', boxShadow: '0 0 10px #00ccff' }} />
                <span className="font-mono text-[11px] text-sf-dim mb-2 block">NOW // SYNC</span>
                <div className="bg-sf-card rounded-xl p-4 border border-sf-cyan/20">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-sf-cyan mb-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing...
                  </div>
                  <div className="text-xs text-sf-secondary">Inventory refresh in progress. Prices are being fetched...</div>
                </div>
              </div>
            )}
            {lastRefresh && !isRefreshing && (
              <div className="relative mb-6">
                <div className="timeline-dot" style={{ borderColor: '#4ADE80', boxShadow: '0 0 10px #4ADE80' }} />
                <span className="font-mono text-[11px] text-sf-dim mb-2 block">{new Date(lastRefresh).toLocaleTimeString('fr-FR')} // SYSTEM</span>
                <div className="bg-sf-card rounded-xl p-4 border border-white/[0.08]">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-sf-green mb-1">
                    <Activity className="w-3.5 h-3.5" /> Sync Complete
                  </div>
                  <div className="text-xs text-sf-secondary">
                    {data.totalItems} items synced &middot; Portfolio: <span className="font-mono text-white">{formatEur(data.totalValue)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── PRICE ALERTS ── */}
      <h3 className="nav-label mb-4">Alertes Prix</h3>
      <div className="relative pl-8 mb-8">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] opacity-30" style={{ background: 'linear-gradient(180deg, #ff3366 0%, #a020f0 50%, transparent 100%)' }} />
        {priceAlerts.length > 0 ? priceAlerts.map(({ item, tag, label, icon, colors }, i) => (
          <div key={item.marketHashName} className="relative mb-5" style={{ opacity: i > 3 ? 0.5 : 1 }}>
            <div className="timeline-dot" style={{ borderColor: colors.dot, boxShadow: `0 0 8px ${colors.dot}` }} />
            <span className="font-mono text-[11px] text-sf-dim mb-1.5 block">{tag} // STEAM_MKT</span>
            <div className={`${colors.bg} rounded-xl p-3.5 border ${colors.border}`}>
              <div className="flex items-center justify-between mb-1">
                <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${colors.text}`}>
                  {icon} {label}
                </div>
                <span className="font-mono text-xs font-bold text-white">{formatEur(item.price)}</span>
              </div>
              <div className="text-xs text-sf-secondary truncate">{item.marketHashName}</div>
              {item.quantity > 1 && <div className="text-[10px] text-sf-dim font-mono mt-1">x{item.quantity} &middot; Total: {formatEur(item.total)}</div>}
            </div>
          </div>
        )) : (
          <div className="relative mb-5">
            <div className="timeline-dot" style={{ borderColor: '#444c56', opacity: 0.5 }} />
            <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] opacity-50">
              <div className="text-[13px] font-semibold text-sf-dim mb-1">No alerts</div>
              <div className="text-xs text-sf-secondary">Refresh your inventory to generate price alerts.</div>
            </div>
          </div>
        )}
      </div>

      {/* ── DAILY HISTORY ── */}
      <h3 className="nav-label mb-4">Historique Journalier</h3>
      <div className="relative pl-8">
        <div className="timeline-line" />
        {data.dailyHistory.length > 0 ? data.dailyHistory.map((entry, i) => {
          const up = entry.change >= 0;
          const color = entry.change !== 0 ? (up ? '#4ADE80' : '#ff3366') : '#444c56';
          return (
            <div key={i} className="relative mb-6" style={{ opacity: i > 6 ? 0.4 : 1 }}>
              <div className="timeline-dot" style={{ borderColor: color, boxShadow: `0 0 8px ${color}` }} />
              <span className="font-mono text-[11px] text-sf-dim mb-1.5 block">{formatDate(entry.date)} // VALUATION</span>
              <div className={`bg-sf-card rounded-xl p-3.5 border ${i > 6 ? 'border-dashed border-white/[0.06]' : 'border-white/[0.08]'}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-bold text-white">{formatEur(entry.value)}</span>
                  <span className="text-[10px] text-sf-dim font-mono">{entry.itemCount} items</span>
                </div>
                {entry.change !== 0 ? (
                  <div className={`flex items-center gap-1 text-xs font-mono ${up ? 'text-sf-green' : 'text-sf-pink'}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? '+' : ''}{formatEur(entry.change)} ({formatPercent(entry.changePercent)})
                  </div>
                ) : (
                  <div className="text-xs text-sf-dim font-mono">Aucun changement</div>
                )}
              </div>
            </div>
          );
        }) : (
          <div className="relative mb-5">
            <div className="timeline-dot" style={{ borderColor: '#444c56', opacity: 0.5 }} />
            <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] opacity-50">
              <div className="text-[13px] font-semibold text-sf-dim mb-1">No History</div>
              <div className="text-xs text-sf-secondary">Aucune donnee historique enregistree.</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function FeedItem({ time, title, desc, color, dim }: { time: string; title: string; desc: string; color: string; dim?: boolean }) {
  return (
    <div className="relative mb-8" style={{ opacity: dim ? 0.5 : 1 }}>
      <div className="timeline-dot" style={{ borderColor: color, boxShadow: `0 0 10px ${color}` }} />
      <span className="font-mono text-[11px] text-sf-dim mb-2 block">{time}</span>
      <div className={`bg-sf-card rounded-xl p-4 border ${dim ? 'border-dashed border-white/[0.06]' : 'border-white/[0.08]'}`}>
        <div className="text-[13px] font-semibold mb-1" style={{ color }}>{title}</div>
        <div className="text-xs text-sf-secondary">{desc}</div>
      </div>
    </div>
  );
}
