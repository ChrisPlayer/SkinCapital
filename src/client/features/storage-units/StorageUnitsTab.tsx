import { StorageUnitCard } from './StorageUnitCard.tsx';
import { useI18n } from '../../lib/i18n.tsx';
import type { StorageUnit } from '../../../shared/types/inventory.ts';

interface StorageUnitsTabProps {
  storageUnits: StorageUnit[];
}

export function StorageUnitsTab({ storageUnits }: StorageUnitsTabProps) {
  const { t } = useI18n();

  if (storageUnits.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-gray-500">
        {t('empty.noStorageUnitsWithItems')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {storageUnits.map((su) => (
        <StorageUnitCard key={su.casketId} unit={su} />
      ))}
    </div>
  );
}
