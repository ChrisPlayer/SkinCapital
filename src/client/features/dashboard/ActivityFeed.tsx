import React, { useState } from 'react';
import { useAlerts, useDeleteAlert } from '../../hooks/useApi.ts';
import { useI18n, type PriceProvider } from '../../lib/i18n.tsx';
import { formatEur, formatPercent, formatDate } from '../../lib/formatters.ts';
import { getDisplayItemName } from '../../lib/item-display.ts';
import { Activity, ChevronDown, Loader2, TrendingUp, TrendingDown, X } from 'lucide-react';
import type { DashboardData } from '../../../shared/types/api.ts';
import { sourceLabel } from './dashboard-lib.ts';

export const ActivityFeed = React.memo(function ActivityFeed({
  data,
  steamId,
  pp,
  locale,
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
}: {
  data: DashboardData;
  steamId: string;
  pp: PriceProvider;
  locale: 'fr' | 'en';
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
}) {
  const { t } = useI18n();
  const [showAlerts, setShowAlerts] = useState(true);
  const [showCustomAlerts, setShowCustomAlerts] = useState(true);
  const [showHistory, setShowHistory] = useState(true);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const { data: customAlerts } = useAlerts(steamId);
  const deleteAlertMutation = useDeleteAlert();
  const staleHours = data.priceWindow
    ? Math.max(0, (Date.now() - new Date(data.priceWindow.to + (data.priceWindow.to.includes('Z') ? '' : 'Z')).getTime()) / (1000 * 60 * 60))
    : null;
  const pricesAreStale = staleHours !== null && staleHours >= 20;
  const syncSourceText = syncType === 'prices' ? ` (${sourceLabel(source)})` : '';

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
      {(isRefreshing || lastRefresh || pricesAreStale) && (
        <div className="mb-6">
          <div className="feed-section-title mb-3">{t('feed.system')}</div>
          {isRefreshing && (
            <div className="bg-sf-card rounded-xl p-4 border border-sf-cyan/15 mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-sf-cyan mb-1">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('feed.syncingTitle')}{syncSourceText}
              </div>
              <div className="text-xs text-gray-400">
                {syncType === 'prices' ? t('feed.priceRefreshDesc') : t('feed.syncingDesc')}
                {progress && progress.total > 0 ? ` (${progress.fetched}/${progress.total})` : ''}
              </div>
              {syncType === 'prices' && (
                <button
                  onClick={onCancelPriceRefresh}
                  disabled={isCancelPriceRefreshPending}
                  className="mt-3 h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-gray-300 hover:text-white hover:bg-white/[0.08] transition-colors disabled:opacity-60"
                >
                  {t('feed.cancelRefresh')}
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

          {pricesAreStale && (
            <div className="bg-amber-400/10 rounded-xl p-4 border border-amber-400/25 mt-3">
              <div className="text-sm font-semibold text-amber-200 mb-1">
                {t('feed.pricesStale')}
              </div>
              <div className="text-xs text-amber-100/80 mb-3">
                {t('feed.pricesStaleDesc').replace('{hours}', String(Math.round(staleHours || 0)))}
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
      )}

      {/* PRICE ALERTS */}
      <button className="feed-section-title w-full flex items-center justify-between mb-3 hover:text-white transition-colors" onClick={() => setShowAlerts(!showAlerts)}>
        <span>{t('alerts.title')}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${showAlerts ? '' : '-rotate-90'}`} />
      </button>
      {showAlerts && (
        <div className="space-y-2 mb-6">
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
                  className="w-full py-1.5 text-xs text-sf-cyan hover:underline"
                >
                  {showAllAlerts ? t('feed.showLess') : t('feed.showAll')}
                </button>
              )}
            </>
          ) : (
            <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] text-sm text-gray-500">{t('alerts.noAlerts')}</div>
          )}
        </div>
      )}

      {/* CUSTOM PRICE ALERTS */}
      <button className="feed-section-title w-full flex items-center justify-between mb-3 hover:text-white transition-colors" onClick={() => setShowCustomAlerts(!showCustomAlerts)}>
        <span>{t('alerts.custom')}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${showCustomAlerts ? '' : '-rotate-90'}`} />
      </button>
      {showCustomAlerts && (
        <div className="space-y-2 mb-6">
          {(customAlerts ?? []).length > 0 ? (
            (customAlerts ?? []).map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl p-3.5 border ${alert.triggeredAt ? 'bg-sf-cyan/[0.06] border-sf-cyan/25' : 'bg-sf-card border-white/[0.06]'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-white whitespace-nowrap">
                    {alert.direction === 'below' ? '≤' : '≥'} {formatEur(alert.thresholdEur)}
                  </span>
                  <div className="flex items-center gap-2">
                    {alert.triggeredAt ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sf-cyan whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-sf-cyan" />
                        {t('alerts.triggered')}
                      </span>
                    ) : (
                      alert.currentPrice !== null && (
                        <span className="font-mono text-[11px] text-gray-400 whitespace-nowrap">{formatEur(alert.currentPrice)}</span>
                      )
                    )}
                    <button
                      onClick={() => deleteAlertMutation.mutate({ id: alert.id, steamId })}
                      disabled={deleteAlertMutation.isPending}
                      aria-label={t('item.clear')}
                      className="w-8 h-8 p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors disabled:opacity-50"
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
      )}

      {/* DAILY HISTORY */}
      <button className="feed-section-title w-full flex items-center justify-between mb-3 hover:text-white transition-colors" onClick={() => setShowHistory(!showHistory)}>
        <span>{t('history.title')}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${showHistory ? '' : '-rotate-90'}`} />
      </button>
      {showHistory && (
        data.dailyHistory.length > 0 ? (
          <div className="bg-sf-card rounded-xl border border-white/[0.06] overflow-hidden">
            {(showAllHistory ? data.dailyHistory : data.dailyHistory.slice(0, 5)).map((entry) => {
              const up = entry.change >= 0;
              return (
                <div key={entry.date} className="flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-white/[0.05] last:border-b-0">
                  <span className="text-[11px] text-gray-500 whitespace-nowrap">{formatDate(entry.date, locale)}</span>
                  <span className="flex items-baseline gap-2 font-mono min-w-0">
                    <span className="text-sm font-bold text-white whitespace-nowrap">{formatEur(entry.value, pp)}</span>
                    {entry.change !== 0 ? (
                      <span className={`text-[11px] whitespace-nowrap ${up ? 'text-sf-green' : 'text-sf-pink'}`}>
                        {up ? '+' : ''}{formatEur(entry.change, pp)} ({formatPercent(entry.changePercent)})
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-500">—</span>
                    )}
                  </span>
                </div>
              );
            })}
            {data.dailyHistory.length > 5 && (
              <button
                onClick={() => setShowAllHistory(!showAllHistory)}
                className="w-full py-2 text-xs text-sf-cyan hover:underline border-t border-white/[0.05]"
              >
                {showAllHistory ? t('feed.showLess') : t('feed.showAll')}
              </button>
            )}
          </div>
        ) : (
          <div className="bg-sf-card rounded-xl p-4 border border-dashed border-white/[0.06] text-sm text-gray-500">{t('history.noHistory')}</div>
        )
      )}
    </>
  );
});
