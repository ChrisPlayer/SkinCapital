import React, { useEffect, useMemo, useState } from 'react';
import { type PriceProvider, type TranslationKey } from '../../lib/i18n.tsx';
import { formatEur } from '../../lib/formatters.ts';
import { useCountUp } from '../../hooks/useCountUp.ts';
import { itemCategory, type ItemCategoryId } from '../../../shared/lib/item-names.ts';
import type { ItemGroup } from '../../../shared/types/inventory.ts';
import { SECTION_TITLE, CATEGORY_LABEL_KEYS } from './dashboard-lib.ts';

// Brand sf-* tokens first (cyan, purple, gold, green, pink, secondary), then a neutral.
const COMPOSITION_PALETTE = ['#00ccff', '#a020f0', '#f0b90b', '#4ADE80', '#ff3366', '#8b949e', '#64748b'];

export const PortfolioComposition = React.memo(function PortfolioComposition({ items, locale, t, pp }: {
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
});
