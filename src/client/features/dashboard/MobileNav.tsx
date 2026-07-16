import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, DollarSign, RefreshCw, LogIn, Download, Settings, LogOut } from 'lucide-react';
import { useI18n } from '../../lib/i18n.tsx';
import { api } from '../../lib/api-client.ts';
import type { View } from './shared.ts';
import type { NavItem } from './Sidebar.tsx';

interface MobileNavProps {
  navItems: NavItem[];
  view: View;
  onSwitchView: (view: View) => void;
  steamId: string;
  isOwner: boolean;
  showExport: boolean;
  showLogout: boolean;
  onLogoutClick: () => void;
  accountStatus?: ReactNode;
  onRefreshPrices: () => void;
  refreshPricesDisabled: boolean;
  onRefreshInventory: () => void;
  refreshInventoryDisabled: boolean;
  showRefreshInventory: boolean;
}

export function MobileNav({
  navItems,
  view,
  onSwitchView,
  steamId,
  isOwner,
  showExport,
  showLogout,
  onLogoutClick,
  accountStatus,
  onRefreshPrices,
  refreshPricesDisabled,
  onRefreshInventory,
  refreshInventoryDisabled,
  showRefreshInventory,
}: MobileNavProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <>
      <div className="md:hidden flex items-center gap-3 mb-4 relative z-10">
        <button onClick={() => navigate('/')} aria-label={t('settings.back')} className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
        <div className="w-1 h-5 rounded-full bg-[color:var(--accent)]" />
        <span className="font-display font-bold text-lg">SkinCapital</span>
        {/* Compact icon-only actions (the desktop header is hidden on mobile) */}
        <div className="flex md:hidden items-center gap-2 ml-auto">
          {accountStatus}
          <button
            onClick={onRefreshPrices}
            disabled={refreshPricesDisabled}
            aria-label={t('dashboard.refreshPrices')}
            title={t('dashboard.refreshPricesTooltip')}
            className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-gray-300 disabled:opacity-50"
          >
            <DollarSign className="w-4 h-4" />
          </button>
          {showRefreshInventory && (
            <button
              onClick={onRefreshInventory}
              disabled={refreshInventoryDisabled}
              aria-label={isOwner ? t('dashboard.refreshInventory') : t('auth.login')}
              title={t('dashboard.refreshInventoryTooltip')}
              className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-gray-300 disabled:opacity-50"
            >
              {isOwner ? <RefreshCw className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            </button>
          )}
          {showExport && (
            <a
              href={api.export.csvUrl(steamId)}
              download
              aria-label={t('dashboard.exportCsv')}
              title={t('dashboard.exportCsv')}
              className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center"
            >
              <Download className="w-4 h-4 text-gray-400" />
            </a>
          )}
          <button
            onClick={() => navigate(`/settings/${steamId}`)}
            aria-label={t('nav.settings')}
            title={t('nav.settings')}
            className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-gray-300"
          >
            <Settings className="w-4 h-4" />
          </button>
          {showLogout && (
            <button
              onClick={onLogoutClick}
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
              className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-gray-300"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div className="md:hidden flex gap-1.5 mb-6 overflow-x-auto relative z-10 pb-1">
        {navItems.map((n) => (
          <button key={n.id} onClick={() => onSwitchView(n.id)} className={`sf-tag whitespace-nowrap ${view === n.id ? 'btn-accent font-semibold' : ''}`}>
            {n.label}
          </button>
        ))}
      </div>
    </>
  );
}
