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
  return (
    <div
      className="glass-card rounded-xl p-4 cursor-pointer transition-all duration-200 hover:translate-y-[-2px] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] group"
      onClick={onClick}
      style={{ borderLeft: `3px solid ${item.rarity.color}` }}
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-[120px] h-[90px] rounded-lg bg-black/30 flex items-center justify-center overflow-hidden">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt=""
              className="w-[120px] h-[90px] object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] group-hover:scale-110 transition-transform duration-300"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="text-xl opacity-50">&#128299;</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate" title={displayName}>
                {displayName}
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {item.wear && (
                  <span
                    className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                    style={{ color: item.wear.color, background: `${item.wear.color}20` }}
                  >
                    {item.wear.name}
                  </span>
                )}
                {item.floatValue !== null && item.floatValue !== undefined && (
                  <span className="text-[10px] font-mono text-gray-500">{item.floatValue.toFixed(4)}</span>
                )}
                {item.quantity > 1 && (
                  <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white/10 text-white">
                    x{item.quantity}
                  </span>
                )}
                {showCasketBadge && item.casketIds.length > 0 && (
                  <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-400">
                    SU {item.casketIds.length}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
              <div className="px-2 py-1 rounded-md bg-black/40 border border-white/5 group-hover:border-cs-orange/30 transition-colors">
                <p className={`text-xs font-bold font-mono ${item.price ? 'text-cs-orange' : 'text-gray-600'}`}>
                  {formatEur(item.price, pp)}
                </p>
              </div>
              {item.quantity > 1 && item.total > 0 && (
                <p className="text-[10px] text-gray-500 font-mono">Tot: {formatEur(item.total, pp)}</p>
              )}
            </div>
          </div>

          {item.floatValue !== null && item.floatValue !== undefined && (
            <div className="mt-1.5 opacity-60 hover:opacity-100 transition-opacity">
              <FloatBar value={item.floatValue} />
            </div>
          )}

          <StickerRow stickers={item.stickers} stickerValue={item.stickerValue} />
        </div>
      </div>
    </div>
  );
}
