import React, { useMemo, useState } from 'react';
import { type PriceProvider, type TranslationKey } from '../../lib/i18n.tsx';
import { formatEur, formatPercent, formatDate, computePnl } from '../../lib/formatters.ts';
import { PillButton } from '../../components/controls.tsx';
import { useCountUp } from '../../hooks/useCountUp.ts';
import type { DashboardData, HistoryPoint } from '../../../shared/types/api.ts';
import { REDUCED_MOTION, SECTION_TITLE, COUNT_FORMATTERS } from './dashboard-lib.ts';

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

// Flagship hero card: animated total, period toggle and the value-history
// chart. Owns the crosshair hover state so per-mousemove re-renders stay
// confined to this component instead of the whole dashboard.
export const HeroChart = React.memo(function HeroChart({ data, days, onDaysChange, pp, locale, t }: {
  data: DashboardData;
  days: number;
  onDaysChange: (days: number) => void;
  pp: PriceProvider;
  locale: 'fr' | 'en';
  t: (key: TranslationKey) => string;
}) {
  const [chartHover, setChartHover] = useState<number | null>(null);

  const chart = useMemo(() => chartPath(data.historyData, 400, 150), [data.historyData]);

  // Shared P&L basis: net-of-fees in steam_fees mode, stickers included (same
  // computation as AssetRow and ItemDetailModal — server invested/pnl unused).
  const pnlStats = useMemo(() => computePnl(data.items, pp), [data.items, pp]);

  // Value-weighted dominant rarity color: blended into the hero glow so the
  // flagship card subtly reflects what the portfolio is made of.
  const dominantRarityColor = useMemo(() => {
    const weights = new Map<string, number>();
    let best: string | null = null;
    let bestWeight = 0;
    for (const item of data.items) {
      if (item.total <= 0) continue;
      const w = (weights.get(item.rarity.color) ?? 0) + item.total;
      weights.set(item.rarity.color, w);
      if (w > bestWeight) { bestWeight = w; best = item.rarity.color; }
    }
    return best;
  }, [data.items]);

  const animatedTotal = useCountUp(data.totalValue);
  const formatCount = (value: number) => COUNT_FORMATTERS[locale].format(value);

  // Hero chart crosshair: nearest data point under the cursor or finger.
  const setHoverFromClientX = (clientX: number, el: HTMLDivElement) => {
    if (data.historyData.length < 2) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (data.historyData.length - 1));
    setChartHover(Math.max(0, Math.min(data.historyData.length - 1, idx)));
  };
  const handleChartMove = (e: React.MouseEvent<HTMLDivElement>) => {
    setHoverFromClientX(e.clientX, e.currentTarget);
  };
  const handleChartTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (touch) setHoverFromClientX(touch.clientX, e.currentTarget);
  };
  const hoverPoint = chartHover !== null ? chart.points[chartHover] : undefined;
  const hoverDatum = chartHover !== null ? data.historyData[chartHover] : undefined;
  const hoverPct = hoverPoint ? (hoverPoint.x / 400) * 100 : 0;

  return (
    <section className="sf-card relative overflow-hidden p-6 mb-8">
      {/* Faint radial glow behind the flagship number, tinted by the
          value-weighted dominant rarity blended into the accent. */}
      <div
        className="pointer-events-none absolute -top-16 -left-12 w-96 h-56"
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
              <PillButton key={d} active={days === d} onClick={() => onDaysChange(d)}>
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
              {data.change24h.change >= 0 ? '▲' : '▼'}
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
          onTouchStart={chart.line ? handleChartTouch : undefined}
          onTouchMove={chart.line ? handleChartTouch : undefined}
          onTouchEnd={() => setChartHover(null)}
          onTouchCancel={() => setChartHover(null)}
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
                        <animate attributeName="r" values="4;9;4" dur="2.4s" repeatCount="indefinite" />
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
  );
});
