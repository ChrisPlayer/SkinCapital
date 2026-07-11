import React, { useMemo } from 'react';
import { applyFees, useI18n, type PriceProvider } from '../../lib/i18n.tsx';
import { formatEur } from '../../lib/formatters.ts';
import { getDisplayItemName } from '../../lib/item-display.ts';
import { detectPatterns } from '../../../shared/lib/patterns.ts';
import { weaponTag } from '../../../shared/lib/item-names.ts';
import type { ItemGroup } from '../../../shared/types/inventory.ts';
import { activationKeyDown } from './dashboard-lib.ts';

export const AssetRow = React.memo(function AssetRow({ item, pp, compact = false, onSelect }: {
  item: ItemGroup;
  pp: PriceProvider;
  compact?: boolean;
  onSelect: (item: ItemGroup) => void;
}) {
  const { t } = useI18n();
  const displayName = getDisplayItemName(item.marketHashName, item.wear?.name);
  const tag = weaponTag(displayName);
  // Shared P&L basis: net-of-fees in steam_fees mode, stickers included.
  const rowPnl = item.buyPrice != null ? (applyFees(item.total, pp) ?? 0) - item.buyPrice * item.quantity : null;
  // Subtle indicator when this item has a notable (gold/cyan) rare-pattern tag.
  const patternTags = useMemo(
    () => detectPatterns({ marketHashName: item.marketHashName, floatValue: item.floatValue, paintSeed: item.paintSeed }),
    [item.marketHashName, item.floatValue, item.paintSeed],
  );
  const notableTier = patternTags.find((p) => p.tier === 'gold')
    ? 'gold'
    : patternTags.find((p) => p.tier === 'cyan')
      ? 'cyan'
      : null;

  const handleActivate = () => onSelect(item);

  return (
    <div
      className={`asset-row ${compact ? 'asset-row--compact [content-visibility:auto] [contain-intrinsic-size:auto_56px]' : '[content-visibility:auto] [contain-intrinsic-size:auto_72px]'}`}
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={activationKeyDown(handleActivate)}
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
              title={t('patterns.title')}
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
});
