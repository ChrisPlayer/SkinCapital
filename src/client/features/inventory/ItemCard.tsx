import type { CSSProperties } from 'react';
import { FloatBar } from './FloatBar.tsx';
import { StickerRow } from './StickerRow.tsx';
import { formatEur } from '../../lib/formatters.ts';
import { useI18n } from '../../lib/i18n.tsx';
import { getDisplayItemName } from '../../lib/item-display.ts';
import type { ItemGroup } from '../../../shared/types/inventory.ts';

interface ItemCardProps {
  item: ItemGroup;
  onClick?: () => void;
  showCasketBadge?: boolean;
}

export function ItemCard({ item, onClick, showCasketBadge }: ItemCardProps) {
  const { priceProvider: pp } = useI18n();
  const displayName = getDisplayItemName(item.marketHashName, item.wear?.name);
  const hasFloat = item.floatValue !== null && item.floatValue !== undefined;

  return (
    <div
      className="group glass-card relative overflow-hidden rounded-2xl p-3.5 sm:p-4 cursor-pointer border border-white/[0.08] transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] [content-visibility:auto] [contain-intrinsic-size:auto_280px]"
      onClick={onClick}
      style={{ '--rarity': item.rarity.color } as CSSProperties}
    >
      {/* Rarity accent line (own element so it never overrides the card shadows) */}
      <div className="absolute inset-x-0 top-0 h-[2px] z-10" style={{ background: item.rarity.color }} />
      <div
        className="relative h-[150px] rounded-xl border border-white/[0.06] overflow-hidden flex items-center justify-center"
        style={{
          backgroundImage: `radial-gradient(closest-side, ${item.rarity.color}14, transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))`,
        }}
      >
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.marketHashName}
            className="w-[190px] h-[140px] object-contain drop-shadow-[0_5px_16px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="text-xs font-semibold text-gray-500">Item</span>
        )}
        {item.quantity > 1 && (
          <span className="absolute top-2 left-2 inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-black/55 border border-white/[0.12] text-white">
            x{item.quantity}
          </span>
        )}
        {showCasketBadge && item.casketIds.length > 0 && (
          <span className="absolute top-2 right-2 inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-500/20 border border-purple-400/25 text-purple-200">
            SU {item.casketIds.length}
          </span>
        )}
      </div>

      <div className="mt-3 min-w-0">
        <p className="text-[13px] font-semibold text-white truncate" title={displayName}>
          {displayName}
        </p>

        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap min-h-[22px]">
          {item.quality === 'stattrak' && (
            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold text-[#CF6A32] bg-[#CF6A32]/15">
              StatTrak
            </span>
          )}
          {item.quality === 'souvenir' && (
            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold text-[#FFD700] bg-[#FFD700]/15">
              Souvenir
            </span>
          )}
          {item.wear && (
            <span
              className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold"
              style={{ color: item.wear.color, background: `${item.wear.color}1F` }}
            >
              {item.wear.name}
            </span>
          )}
          <span
            className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold"
            style={{ color: item.rarity.color, background: item.rarity.bg }}
          >
            {item.rarity.name}
          </span>
          {hasFloat && (
            <span className="text-[10px] font-mono text-gray-500">{item.floatValue!.toFixed(4)}</span>
          )}
        </div>

        {hasFloat && (
          <div className="mt-2">
            <FloatBar value={item.floatValue!} />
          </div>
        )}

        <StickerRow stickers={item.stickers} stickerValue={item.stickerValue} />

        <div className="mt-2 pt-2 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <p className={`font-mono text-base font-bold ${item.price !== null ? 'text-white' : 'text-gray-600'}`}>
            {formatEur(item.price, pp)}
          </p>
          {item.quantity > 1 && item.total > 0 && (
            <p className="text-[11px] text-sf-green font-mono">{formatEur(item.total, pp)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
