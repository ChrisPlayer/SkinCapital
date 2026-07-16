import { useMemo, useState } from 'react';
import { Search, Scale } from 'lucide-react';
import { useI18n, type PriceProvider } from '../../lib/i18n.tsx';
import { usePriceComparison } from '../../hooks/useApi.ts';
import { formatEur, formatPercent } from '../../lib/formatters.ts';
import { getDisplayItemName } from '../../lib/item-display.ts';
import { sourceLabel } from './shared.ts';

type Source = 'steam' | 'csfloat' | 'skinport';

interface CompareViewProps {
  steamId: string;
  pp: PriceProvider;
  trackedSources: Source[];
  primarySource: Source;
}

/**
 * Source comparator: latest price per tracked source for every owned item,
 * spread computed against the primary source. Only reachable when 2+ sources
 * are tracked (Settings).
 */
export function CompareView({ steamId, pp, trackedSources, primarySource }: CompareViewProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const { data, isLoading } = usePriceComparison(steamId);

  const rows = useMemo(() => {
    const altSources = trackedSources.filter((s) => s !== primarySource);
    const list = (data ?? [])
      .map((row) => {
        const primary = row.prices[primarySource];
        let bestSpread: number | null = null;
        for (const s of altSources) {
          const alt = row.prices[s];
          if (primary !== null && primary > 0 && alt !== null) {
            const spread = ((alt - primary) / primary) * 100;
            if (bestSpread === null || Math.abs(spread) > Math.abs(bestSpread)) bestSpread = spread;
          }
        }
        return { ...row, primary, bestSpread };
      })
      // Sub-50c primaries produce absurd percentages; comparisons need 2 prices.
      .filter((r) => r.primary !== null && r.primary >= 0.5 && r.bestSpread !== null)
      .sort((a, b) => Math.abs(b.bestSpread!) - Math.abs(a.bestSpread!));
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((r) => r.marketHashName.toLowerCase().includes(q));
  }, [data, trackedSources, primarySource, search]);

  if (isLoading) {
    return (
      <div className="fade-up space-y-1.5">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-14" />)}
      </div>
    );
  }

  return (
    <div className="fade-up">
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.label')}
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-sf-card border border-white/[0.08] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[color:color-mix(in_srgb,var(--accent)_30%,transparent)]"
          />
        </div>
        <span className="font-mono text-xs text-gray-500">{rows.length} items</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-5">{t('compare.caption')}</p>

      {rows.length === 0 ? (
        <div className="sf-card p-10 text-center">
          <Scale className="w-10 h-10 text-sf-dim mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t('compare.none')}</p>
        </div>
      ) : (
        <div className="sf-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{t('compare.item')}</th>
                  {trackedSources.map((s) => (
                    <th key={s} className={`px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] ${s === primarySource ? 'text-[color:var(--accent)]' : 'text-gray-400'}`}>
                      {sourceLabel(s)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{t('compare.spread')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row) => (
                  <tr key={row.marketHashName} className="border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        {row.imageUrl ? (
                          <img src={row.imageUrl} alt="" loading="lazy" className="w-9 h-9 rounded object-contain shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded bg-white/[0.03] shrink-0" aria-hidden="true" />
                        )}
                        <div className="min-w-0">
                          <div className="text-[13px] text-white truncate max-w-[320px]">{getDisplayItemName(row.marketHashName)}</div>
                          {row.quantity > 1 && <div className="font-mono text-[10px] text-gray-500">x{row.quantity}</div>}
                        </div>
                      </div>
                    </td>
                    {trackedSources.map((s) => {
                      const val = row.prices[s];
                      return (
                        <td key={s} className={`px-4 py-2.5 text-right font-mono text-sm tabular-nums whitespace-nowrap ${s === primarySource ? 'text-white font-bold' : 'text-gray-300'}`}>
                          {val !== null ? formatEur(val, s === 'steam' ? pp : undefined) : '—'}
                        </td>
                      );
                    })}
                    <td className={`px-4 py-2.5 text-right font-mono text-sm font-bold tabular-nums whitespace-nowrap ${row.bestSpread! >= 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
                      {formatPercent(row.bestSpread!)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
