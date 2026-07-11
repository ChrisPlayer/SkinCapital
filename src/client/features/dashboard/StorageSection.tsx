import React, { useState } from 'react';
import { FolderOpen, ChevronDown } from 'lucide-react';
import { useI18n, type PriceProvider } from '../../lib/i18n.tsx';
import { formatEur } from '../../lib/formatters.ts';
import type { ItemGroup, StorageUnit } from '../../../shared/types/inventory.ts';
import { activationKeyDown } from './dashboard-lib.ts';
import { AssetRow } from './AssetRow.tsx';

// A storage unit holds up to 1000 items; mounting them all at once on expand
// freezes the tab, so only the first slice renders until asked for the rest.
const STORAGE_PREVIEW_COUNT = 50;

export const StorageSection = React.memo(function StorageSection({ unit, pp, valueRatio = 0, onItemClick }: {
  unit: StorageUnit;
  pp: PriceProvider;
  valueRatio?: number;
  onItemClick: (item: ItemGroup) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);
  const visibleItems = showAllItems ? unit.items : unit.items.slice(0, STORAGE_PREVIEW_COUNT);
  return (
    <div className="sf-card overflow-hidden">
      <div
        className="p-5 pb-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={activationKeyDown(() => setOpen(!open))}
      >
        <div className="flex items-center gap-4">
          {unit.imageUrl ? (
            <img src={unit.imageUrl} alt="" className="w-12 h-12 rounded-lg object-contain" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-sf-purple/10 border border-sf-purple/20 flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-sf-purple" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <p className="font-semibold text-sm">{unit.name}</p>
              <span className="font-mono text-base font-bold text-gray-400">{unit.itemCount}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono font-bold text-sf-cyan text-base">{formatEur(unit.totalValue, pp)}</span>
          <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${open ? '' : '-rotate-90'}`} />
        </div>
      </div>
      {/* Value bar: this unit's worth relative to the most valuable unit */}
      <div className="mx-5 mb-4 h-[2px] rounded-full bg-white/[0.05]" aria-hidden="true">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(1, valueRatio)) * 100}%`,
            background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 25%, transparent), var(--accent))',
          }}
        />
      </div>
      {open && (
        <div className="border-t border-white/[0.06] px-4 pb-4 space-y-1 pt-3">
          {visibleItems.map((item) => (
            <AssetRow key={item.marketHashName} item={item} pp={pp} onSelect={onItemClick} />
          ))}
          {!showAllItems && unit.items.length > STORAGE_PREVIEW_COUNT && (
            <button
              onClick={() => setShowAllItems(true)}
              className="w-full py-2 text-xs text-sf-cyan hover:underline"
            >
              {t('storage.showAll').replace('{n}', String(unit.items.length))}
            </button>
          )}
        </div>
      )}
    </div>
  );
});
