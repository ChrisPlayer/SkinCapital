import { useState } from 'react';
import { Card } from '../../components/ui/card.tsx';
import { ItemCard } from '../inventory/ItemCard.tsx';
import { ItemDetailModal } from '../inventory/ItemDetailModal.tsx';
import { useI18n } from '../../lib/i18n.tsx';
import { formatEur } from '../../lib/formatters.ts';
import { ChevronDown, FolderOpen } from 'lucide-react';
import type { StorageUnit, ItemGroup } from '../../../shared/types/inventory.ts';

interface StorageUnitCardProps {
  unit: StorageUnit;
  defaultOpen?: boolean;
}

export function StorageUnitCard({ unit, defaultOpen = false }: StorageUnitCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedItem, setSelectedItem] = useState<ItemGroup | null>(null);
  const { t } = useI18n();

  return (
    <Card className={`glass-card transition-all duration-300 overflow-hidden ${isOpen ? 'border-cs-purple/50' : 'hover:border-cs-purple/30'}`}>
      <div
        className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cs-purple/30 to-cs-pink/20 flex items-center justify-center border border-cs-purple/20">
            <FolderOpen className="w-6 h-6 text-cs-purple" />
          </div>
          <div>
            <p className="text-base font-bold text-white">{unit.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-mono text-gray-600">...{unit.shortId}</span>
              <span className="mx-2 text-gray-700">&bull;</span>
              <span>{unit.itemCount} items</span>
              <span className="mx-2 text-gray-700">&bull;</span>
              <span>{unit.uniqueItems} {t('kpi.uniques')}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-xl font-extrabold text-cs-orange">{formatEur(unit.totalValue)}</p>
          <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-white/5 px-5 pb-5">
          {unit.items.length === 0 ? (
            <div className="text-center p-4 text-gray-500 bg-white/5 rounded-xl mt-4">
              {t('empty.noItems')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 pt-4">
              {unit.items.map((item) => (
                <ItemCard
                  key={item.marketHashName}
                  item={item}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ItemDetailModal
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => { if (!open) setSelectedItem(null); }}
      />
    </Card>
  );
}
