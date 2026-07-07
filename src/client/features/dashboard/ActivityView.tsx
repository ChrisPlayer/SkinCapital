import { useState } from 'react';
import { Loader2, Activity, TrendingUp, TrendingDown, X, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useI18n, type PriceProvider } from '../../lib/i18n.tsx';
import { formatEur, formatPercent, formatDate } from '../../lib/formatters.ts';
import { getDisplayItemName } from '../../lib/item-display.ts';
import { useAlerts, useDeleteAlert, useInventoryMovements, useProfiles } from '../../hooks/useApi.ts';
import { sourceLabel } from './shared.ts';
import type { DashboardData } from '../../../shared/types/api.ts';

interface ActivityViewProps {
  data: DashboardData;
  steamId: string;
  pp: PriceProvider;
  locale: 'fr' | 'en';
  isAggregate: boolean;
  isRefreshing: boolean;
  syncType: 'inventory' | 'prices' | null;
  source: 'steam' | 'csfloat' | 'skinport' | null;
  selectedPriceSource: 'steam' | 'csfloat' | 'skinport';
  lastRefresh: string | null;
  progress: { fetched: number; total: number } | null;
  onRefreshPrices: () => void;
  onCancelPriceRefresh: () => void;
  isRefreshPricesPending: boolean;
  isCancelPriceRefreshPending: boolean;
}

/** Full-width Activity tab (replaces the old fixed 380px side panel). */
export function ActivityView({
  data,
  steamId,
  pp,
  locale,
  isAggregate,
  isRefreshing,
  syncType,
  source,
  selectedPriceSource,
  lastRefresh,
  progress,
  onRefreshPrices,
  onCancelPriceRefresh,
  isRefreshPricesPending,
  isCancelPriceRefreshPending,
}: ActivityViewProps) {
  const { t } = useI18n();
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showAllMovements, setShowAllMovements] = useState(false);
  const { data: customAlerts } = useAlerts(steamId);
  const { data: movements } = useInventoryMovements(steamId);
  const { data: profiles } = useProfiles();
  const deleteAlertMutation = useDeleteAlert();

  const staleHours = data.priceWindow
    ? Math.max(0, (Date.now() - new Date(data.priceWindow.to + (data.priceWindow.to.includes('Z') ? '' : 'Z')).getTime()) / (1000 * 60 * 60))
    : null;
  const pricesAreStale = staleHours !== null && staleHours >= 20;
  const syncSourceText = syncType === 'prices' ? ` (${sourceLabel(source)})` : '';

  const priceAlerts = data.items
    .filter((item) => item.priceChange !== null && item.priceChangePercent !== null && Math.abs(item.priceChange) >= 5 && Math.abs(item.priceChangePercent) >= 5)
    .slice(0, 12)
    .map((item) => {
      const pct = item.priceChangePercent!;
      const change = item.priceChange!;
      const isUp = change > 0;
      const isBig = Math.abs(pct) > 10;
      const alertType = isBig ? (isUp ? 'high' : 'critical') : 'notable';
      const label = isBig ? (isUp ? t('alerts.priceUp') : t('alerts.priceDown')) : (isUp ? t('alerts.moderateUp') : t('alerts.moderateDown'));
      const icon = isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />;
      const colors = {
        critical: { bg: 'bg-[#ff336608]', border: 'border-[#ff336618]', text: 'text-sf-pink' },
        high: { bg: 'bg-[#4ADE8008]', border: 'border-[#4ADE8018]', text: 'text-sf-green' },
        notable: { bg: 'bg-[color:color-mix(in_srgb,var(--accent)_4%,transparent)]', border: 'border-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]', text: 'text-[color:var(--accent)]' },
      }[alertType as string] as { bg: string; border: string; text: string };
      return { item, label, icon, colors, change, pct };
    });

  const personaFor = (id: string) => {
    const p = profiles?.find((pr) => pr.steamId === id);
    return p?.personaName ?? p?.username ?? id;
  };

  const visibleMovements = showAllMovements ? (movements ?? []) : (movements ?? []).slice(0, 8);

  return (
    <div className="fade-up grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-8 items-start">
      {/* SYSTEM */}
      <div>
        <div className="feed-section-title mb-3">{t('feed.system')}</div>
        {isRefreshing && (
          <div className="bg-sf-card rounded-xl p-4 border border-[color:color-mix(in_srgb,var(--accent)_15%,transparent)] mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--accent)] mb-1">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('feed.syncingTitle')}{syncSourceText}
            </div>
            <div className="text-xs text-gray-400">
              {syncType === 'prices'
                ? (locale === 'fr' ? 'Mise à jour des prix en cours...' : 'Price refresh in progress...')
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
                ({sourceLabel(selectedPriceSource)})
              </span>
            </div>
            <div className="text-xs text-gray-400">
              {data.totalItems} {t('feed.itemsSynced')} &middot; <span className="text-white font-mono">{formatEur(data.totalValue, pp)}</span>
            </div>
          </div>
        )}
        {!isRefreshing && !lastRefresh && !pricesAreStale && (
          <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] text-sm text-gray-500">
            {locale === 'fr' ? 'Aucune synchronisation récente.' : 'No recent sync.'}
          </div>
        )}
        {pricesAreStale && (
          <div className="bg-amber-400/10 rounded-xl p-4 border border-amber-400/25 mt-3">
            <div className="text-sm font-semibold text-amber-200 mb-1">
              {locale === 'fr' ? 'Prix à rafraîchir' : 'Prices need refresh'}
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
      </div>

      {/* PRICE ALERTS */}
      <div>
        <div className="feed-section-title mb-3">{t('alerts.title')}</div>
        <div className="space-y-2">
          {priceAlerts.length > 0 ? (
            <>
              {(showAllAlerts ? priceAlerts : priceAlerts.slice(0, 5)).map(({ item, label, icon, colors, change, pct }) => (
                <div key={item.marketHashName} className={`${colors.bg} rounded-xl p-3.5 border ${colors.border}`}>
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
              ))}
              {priceAlerts.length > 5 && (
                <button
                  onClick={() => setShowAllAlerts(!showAllAlerts)}
                  className="w-full py-1.5 text-xs text-[color:var(--accent)] hover:underline"
                >
                  {showAllAlerts ? t('feed.showLess') : t('feed.showAll')}
                </button>
              )}
            </>
          ) : (
            <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] text-sm text-gray-500">{t('alerts.noAlerts')}</div>
          )}
        </div>
      </div>

      {/* CUSTOM PRICE ALERTS */}
      <div>
        <div className="feed-section-title mb-3">{t('alerts.custom')}</div>
        <div className="space-y-2">
          {(customAlerts ?? []).length > 0 ? (
            (customAlerts ?? []).map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl p-3.5 border ${alert.triggeredAt ? 'bg-[color:color-mix(in_srgb,var(--accent)_6%,transparent)] border-[color:color-mix(in_srgb,var(--accent)_25%,transparent)]' : 'bg-sf-card border-white/[0.06]'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-white whitespace-nowrap">
                    {alert.direction === 'below' ? '≤' : '≥'} {formatEur(alert.thresholdEur)}
                  </span>
                  <div className="flex items-center gap-2">
                    {alert.triggeredAt ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[color:var(--accent)] whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)]" />
                        {t('alerts.triggered')}
                      </span>
                    ) : (
                      alert.currentPrice !== null && (
                        <span className="font-mono text-[11px] text-gray-400 whitespace-nowrap">{formatEur(alert.currentPrice)}</span>
                      )
                    )}
                    <button
                      onClick={() => deleteAlertMutation.mutate({ id: alert.id, steamId: alert.steamId })}
                      disabled={deleteAlertMutation.isPending}
                      aria-label={t('item.clear')}
                      className="w-6 h-6 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      <X className="w-3 h-3 text-gray-500" />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-400 truncate">{getDisplayItemName(alert.marketHashName)}</div>
              </div>
            ))
          ) : (
            <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] text-sm text-gray-500">{t('alerts.none')}</div>
          )}
        </div>
      </div>

      {/* INVENTORY MOVEMENTS — full width */}
      <div className="lg:col-span-2 xl:col-span-3">
        <div className="feed-section-title mb-3">{t('feed.movements')}</div>
        {(movements ?? []).length > 0 ? (
          <div className="bg-sf-card rounded-xl border border-white/[0.06] overflow-hidden">
            {visibleMovements.map((m) => {
              const added = m.delta > 0;
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.05] last:border-b-0">
                  {added
                    ? <ArrowDownLeft className="w-4 h-4 text-sf-green shrink-0" aria-hidden="true" />
                    : <ArrowUpRight className="w-4 h-4 text-sf-pink shrink-0" aria-hidden="true" />}
                  <span className={`font-mono text-xs font-bold w-10 shrink-0 tabular-nums ${added ? 'text-sf-green' : 'text-sf-pink'}`}>
                    {added ? `+${m.delta}` : m.delta}
                  </span>
                  <span className="text-xs text-gray-300 truncate flex-1 min-w-0">{getDisplayItemName(m.marketHashName)}</span>
                  {isAggregate && (
                    <span className="text-[11px] text-gray-500 truncate max-w-[140px]">{personaFor(m.steamId)}</span>
                  )}
                  {m.priceEur !== null && (
                    <span className="font-mono text-xs text-white shrink-0 w-20 text-right tabular-nums">{formatEur(m.priceEur, pp)}</span>
                  )}
                  <span className="font-mono text-[11px] text-gray-500 shrink-0 whitespace-nowrap">{formatDate(m.createdAt, locale)}</span>
                </div>
              );
            })}
            {(movements ?? []).length > 8 && (
              <button
                onClick={() => setShowAllMovements(!showAllMovements)}
                className="w-full py-2 text-xs text-[color:var(--accent)] hover:underline border-t border-white/[0.05]"
              >
                {showAllMovements ? t('feed.showLess') : t('feed.showAll')}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] text-sm text-gray-500">{t('movements.none')}</div>
        )}
      </div>

      {/* DAILY HISTORY — full width table */}
      <div className="lg:col-span-2 xl:col-span-3">
        <div className="feed-section-title mb-3">{t('history.title')}</div>
        {data.dailyHistory.length > 0 ? (
          <div className="bg-sf-card rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <tbody>
                  {(showAllHistory ? data.dailyHistory : data.dailyHistory.slice(0, 8)).map((entry) => {
                    const up = entry.change >= 0;
                    return (
                      <tr key={entry.date} className="border-b border-white/[0.05] last:border-b-0">
                        <td className="px-4 py-2.5 text-[11px] text-gray-500 whitespace-nowrap">{formatDate(entry.date, locale)}</td>
                        <td className="px-4 py-2.5 font-mono text-sm font-bold text-white whitespace-nowrap tabular-nums">{formatEur(entry.value, pp)}</td>
                        <td className={`px-4 py-2.5 font-mono text-[11px] whitespace-nowrap tabular-nums ${entry.change !== 0 ? (up ? 'text-sf-green' : 'text-sf-pink') : 'text-gray-600'}`}>
                          {entry.change !== 0 ? `${up ? '+' : ''}${formatEur(entry.change, pp)}` : '—'}
                        </td>
                        <td className={`px-4 py-2.5 font-mono text-[11px] whitespace-nowrap tabular-nums ${entry.change !== 0 ? (up ? 'text-sf-green' : 'text-sf-pink') : 'text-gray-600'}`}>
                          {entry.change !== 0 ? formatPercent(entry.changePercent) : ''}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500 whitespace-nowrap tabular-nums w-full text-right">
                          {entry.itemCount} {t('dashboard.itemsLabel')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.dailyHistory.length > 8 && (
              <button
                onClick={() => setShowAllHistory(!showAllHistory)}
                className="w-full py-2 text-xs text-[color:var(--accent)] hover:underline border-t border-white/[0.05]"
              >
                {showAllHistory ? t('feed.showLess') : t('feed.showAll')}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] text-sm text-gray-500">{t('history.noHistory')}</div>
        )}
      </div>
    </div>
  );
}
