import React, { useState } from 'react';
import { useMovers, useTrends } from '../../hooks/useApi.ts';
import { type PriceProvider, type TranslationKey } from '../../lib/i18n.tsx';
import { formatEur, formatPercent } from '../../lib/formatters.ts';
import { getDisplayItemName } from '../../lib/item-display.ts';
import { PillButton } from '../../components/controls.tsx';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import type { ItemGroup } from '../../../shared/types/inventory.ts';
import type { Mover, MoversResponse } from '../../../shared/types/api.ts';
import { SECTION_TITLE, activationKeyDown } from './dashboard-lib.ts';

// Shared props for the two card variants (portfolio movers / market trends).
interface MoversSourceProps {
  source: 'steam' | 'csfloat' | 'skinport';
  pp: PriceProvider;
  locale: 'fr' | 'en';
  t: (key: TranslationKey) => string;
  items: ItemGroup[];
  onItemClick: (item: ItemGroup) => void;
}

// Single renderer behind TopMovers and MarketTrends: identical gainers/losers
// columns, skeletons and empty state — only the query and i18n keys differ.
function MoversCard({
  titleKey,
  captionKey,
  emptyKey,
  emptyDescKey,
  emptyIcon: EmptyIcon,
  days,
  onDaysChange,
  data,
  isLoading,
  source,
  pp,
  locale,
  t,
  items,
  onItemClick,
}: MoversSourceProps & {
  titleKey: TranslationKey;
  /** When present, the header tightens (mb-1) and this caption renders under it. */
  captionKey?: TranslationKey;
  emptyKey: TranslationKey;
  emptyDescKey: TranslationKey;
  emptyIcon: typeof TrendingUp;
  days: 7 | 30;
  onDaysChange: (days: 7 | 30) => void;
  data: MoversResponse | undefined;
  isLoading: boolean;
}) {
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
        <div className="px-2.5 py-1.5 text-xs text-gray-500">{t(emptyKey)}</div>
      )}
    </div>
  );

  return (
    <section className="sf-card p-6 mb-8">
      <div className={`flex items-start justify-between gap-4 flex-wrap ${captionKey ? 'mb-1' : 'mb-4'}`}>
        <span className={SECTION_TITLE}>{t(titleKey)}</span>
        <div className="flex gap-1">
          {([7, 30] as const).map((d) => (
            <PillButton key={d} active={days === d} onClick={() => onDaysChange(d)}>
              {locale === 'fr' ? `${d}J` : `${d}D`}
            </PillButton>
          ))}
        </div>
      </div>
      {captionKey && <p className="text-[11px] text-gray-500 mb-4">{t(captionKey)}</p>}
      {isLoading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
      ) : data.gainers.length === 0 && data.losers.length === 0 ? (
        <div className="py-6 text-center">
          <EmptyIcon className="w-10 h-10 text-sf-dim mx-auto mb-3" />
          <p className="text-sm font-semibold text-white mb-1">{t(emptyKey)}</p>
          <p className="text-xs text-gray-500">{t(emptyDescKey)}</p>
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

export const TopMovers = React.memo(function TopMovers({ steamId, ...shared }: MoversSourceProps & { steamId: string }) {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, isLoading } = useMovers(steamId, shared.source, days);
  return (
    <MoversCard
      {...shared}
      titleKey="movers.title"
      emptyKey="movers.none"
      emptyDescKey="empty.moversDesc"
      emptyIcon={TrendingUp}
      days={days}
      onDaysChange={setDays}
      data={data}
      isLoading={isLoading}
    />
  );
});

// Market-wide trends card. Mirrors TopMovers but uses /api/trends (NOT scoped
// to a profile). Rows are clickable only when the item is in the user's own
// inventory — the market list may include items the user doesn't own.
export const MarketTrends = React.memo(function MarketTrends(shared: MoversSourceProps) {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, isLoading } = useTrends(shared.source, days);
  return (
    <MoversCard
      {...shared}
      titleKey="trends.title"
      captionKey="trends.caption"
      emptyKey="trends.none"
      emptyDescKey="trends.noneDesc"
      emptyIcon={Activity}
      days={days}
      onDaysChange={setDays}
      data={data}
      isLoading={isLoading}
    />
  );
});
