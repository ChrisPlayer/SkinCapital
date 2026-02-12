import { Badge } from '../../components/ui/badge.tsx';
import { FloatBar } from './FloatBar.tsx';
import { StickerRow } from './StickerRow.tsx';
import { formatEur } from '../../lib/formatters.ts';
import type { ItemGroup } from '../../../shared/types/inventory.ts';

interface ItemCardProps {
  item: ItemGroup;
  onClick?: () => void;
  showCasketBadge?: boolean;
}

export function ItemCard({ item, onClick, showCasketBadge }: ItemCardProps) {
  return (
    <div
      className="glass-card rounded-xl p-4 cursor-pointer transition-all duration-200 hover:translate-y-[-2px] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] hover:border-cs-orange/30 group"
      onClick={onClick}
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-[72px] h-[54px] rounded-lg bg-black/30 flex items-center justify-center overflow-hidden">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt=""
              className="w-[72px] h-[54px] object-contain filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] group-hover:scale-110 transition-transform duration-300"
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
              <p className="text-xs font-semibold text-white truncate group-hover:text-white transition-colors" title={item.marketHashName}>
                {item.marketHashName}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <Badge
                  style={{ background: item.rarity.bg, color: item.rarity.color }}
                >
                  {item.rarity.name}
                </Badge>
                {item.wear && (
                  <span className="text-[10px] font-mono" style={{ color: item.wear.color }}>
                    {item.wear.short}
                  </span>
                )}
                {item.quantity > 1 && (
                  <Badge>x{item.quantity}</Badge>
                )}
                {showCasketBadge && item.casketIds.length > 0 && (
                  <Badge className="bg-cs-purple/15 text-cs-purple">
                    SU {item.casketIds.length}
                  </Badge>
                )}
              </div>
            </div>

            <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
              <div className="px-2 py-1 rounded-md bg-black/40 border border-white/5 group-hover:border-cs-orange/30 transition-colors">
                <p className={`text-xs font-bold font-mono ${item.price ? 'text-cs-orange' : 'text-gray-600'}`}>
                  {formatEur(item.price)}
                </p>
              </div>
              {item.quantity > 1 && item.total > 0 && (
                <p className="text-[10px] text-gray-500 font-mono">Tot: {formatEur(item.total)}</p>
              )}
            </div>
          </div>

          {item.floatValue !== null && item.floatValue !== undefined && (
            <div className="mt-1.5 opacity-60 hover:opacity-100 transition-opacity">
              <div className="flex justify-between mb-0.5">
                {item.wear && (
                  <span className="text-[10px]" style={{ color: item.wear.color }}>{item.wear.name}</span>
                )}
                <span className="text-[10px] font-mono text-gray-500">{item.floatValue.toFixed(8)}</span>
              </div>
              <FloatBar value={item.floatValue} />
            </div>
          )}

          <StickerRow stickers={item.stickers} stickerValue={item.stickerValue} />
        </div>
      </div>
    </div>
  );
}
