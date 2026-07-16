import type { ReactNode } from 'react';
import { DollarSign, RefreshCw, LogIn, Download, X } from 'lucide-react';
import { useI18n } from '../../lib/i18n.tsx';
import { PillButton } from '../../components/controls.tsx';
import { api } from '../../lib/api-client.ts';

interface DashboardHeaderProps {
  title: string;
  accountStatus?: ReactNode;
  steamId: string;
  isOwner: boolean;
  showExport: boolean;
  isRefreshing: boolean;
  syncType: 'inventory' | 'prices' | null;
  onCancelPriceRefresh: () => void;
  cancelPending: boolean;
  onRefreshPrices: () => void;
  refreshPricesDisabled: boolean;
  onRefreshInventory: () => void;
  refreshInventoryDisabled: boolean;
  showRefreshInventory: boolean;
  priceWindowLabel: string | null;
}

export function DashboardHeader({
  title,
  accountStatus,
  steamId,
  isOwner,
  showExport,
  isRefreshing,
  syncType,
  onCancelPriceRefresh,
  cancelPending,
  onRefreshPrices,
  refreshPricesDisabled,
  onRefreshInventory,
  refreshInventoryDisabled,
  showRefreshInventory,
  priceWindowLabel,
}: DashboardHeaderProps) {
  const { t } = useI18n();

  return (
    <header className="hidden md:flex flex-wrap justify-between items-center mb-8 relative z-10 gap-4">
      <div className="flex items-center gap-5 min-w-0">
        <h1 className="font-display tracking-tight text-2xl font-bold mb-0.5">{title}</h1>
        {accountStatus}
      </div>
      <div className="flex items-center gap-2">
        {isRefreshing ? (
          syncType === 'prices' && (
            <PillButton onClick={onCancelPriceRefresh} disabled={cancelPending}>
              <X className="w-3.5 h-3.5" />
              {t('common.cancel')}
            </PillButton>
          )
        ) : (
          <>
            <PillButton
              onClick={onRefreshPrices}
              disabled={refreshPricesDisabled}
              title={t('dashboard.refreshPricesTooltip')}
            >
              <DollarSign className="w-4 h-4" />
              <span className="hidden lg:inline">{t('dashboard.refreshPrices')}</span>
            </PillButton>
            {showRefreshInventory && (
              <PillButton
                onClick={onRefreshInventory}
                disabled={refreshInventoryDisabled}
                title={t('dashboard.refreshInventoryTooltip')}
              >
                {isOwner ? <RefreshCw className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                <span className="hidden lg:inline">{isOwner ? t('dashboard.refreshInventory') : t('auth.login')}</span>
              </PillButton>
            )}
          </>
        )}
        {showExport && (
          <a
            href={api.export.csvUrl(steamId)}
            download
            aria-label={t('dashboard.exportCsv')}
            title={t('dashboard.exportCsv')}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.16] transition-all"
          >
            <Download className="w-4 h-4 text-gray-400" />
          </a>
        )}
        {priceWindowLabel && (
          <span className="sf-tag text-gray-400" title={t('dashboard.priceWindowTooltip')}>
            {priceWindowLabel}
          </span>
        )}
      </div>
    </header>
  );
}
