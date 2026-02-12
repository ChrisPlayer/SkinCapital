import type { Sticker } from '../../../shared/types/inventory.ts';
import { formatEur } from '../../lib/formatters.ts';

interface StickerRowProps {
  stickers: Sticker[];
  stickerValue?: number;
}

export function StickerRow({ stickers, stickerValue }: StickerRowProps) {
  if (!stickers || stickers.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-white/5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-gray-500 uppercase tracking-wider">Stickers</span>
        {stickerValue && stickerValue > 0 && (
          <span className="text-[9px] text-cs-orange font-mono">+{formatEur(stickerValue)}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {stickers.map((sticker, i) => (
          <div key={i} className="relative group" title={sticker.name}>
            {sticker.imageUrl ? (
              <img
                src={sticker.imageUrl}
                alt={sticker.name}
                className="w-6 h-6 object-contain drop-shadow-md"
                loading="lazy"
              />
            ) : (
              <div className="w-6 h-6 bg-white/5 rounded flex items-center justify-center text-[8px]">?</div>
            )}
            {sticker.wear !== null && sticker.wear !== undefined && (
              <div className="absolute bottom-0 right-0 bg-black/90 text-[6px] px-1 rounded text-white font-mono">
                {(sticker.wear * 100).toFixed(0)}%
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
