import { useNavigate } from 'react-router-dom';
import { Users, Settings, LogOut, type LucideIcon } from 'lucide-react';
import { useI18n, type PriceProvider } from '../../lib/i18n.tsx';
import { formatEur, formatPercent } from '../../lib/formatters.ts';
import type { ChangeInfo } from '../../../shared/types/api.ts';
import type { View } from './shared.ts';

export interface NavItem {
  id: View;
  icon: LucideIcon;
  label: string;
}

interface SidebarProps {
  navItems: NavItem[];
  view: View;
  onSwitchView: (view: View) => void;
  steamId: string;
  showLogout: boolean;
  onLogoutClick: () => void;
  netValue: number;
  change24h: ChangeInfo;
  pp: PriceProvider;
}

export function Sidebar({
  navItems,
  view,
  onSwitchView,
  steamId,
  showLogout,
  onLogoutClick,
  netValue,
  change24h,
  pp,
}: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <aside className="sf-sidebar hidden md:flex flex-col py-8 px-6">
      <div className="flex items-center gap-3 mb-12">
        <div className="w-1 h-6 rounded-full bg-[color:var(--accent)]" />
        <span className="font-display text-xl font-bold">SkinCapital</span>
      </div>

      <span className="nav-label mb-3">{t('nav.terminal')}</span>
      <nav className="space-y-1 mb-8">
        {navItems.map((n) => (
          <button key={n.id} className={`sf-nav-item ${view === n.id ? 'active' : ''}`} onClick={() => onSwitchView(n.id)}>
            <n.icon className="w-4 h-4" /> {n.label}
          </button>
        ))}
      </nav>

      <span className="nav-label mb-3">{t('nav.account')}</span>
      <nav className="space-y-1">
        <button className="sf-nav-item" onClick={() => navigate('/')}>
          <Users className="w-4 h-4" /> {t('nav.profiles')}
        </button>
        <button className="sf-nav-item" onClick={() => navigate(steamId ? `/settings/${steamId}` : '/settings')}>
          <Settings className="w-4 h-4" /> {t('nav.settings')}
        </button>
        {showLogout && (
          <button className="sf-nav-item" onClick={onLogoutClick}>
            <LogOut className="w-4 h-4" /> {t('nav.logout')}
          </button>
        )}
      </nav>

      <div className="mt-auto p-5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <div className="text-xs text-gray-500 mb-1">{t('dashboard.netValuation')}</div>
        <div className="font-mono text-2xl font-bold">{formatEur(netValue, pp)}</div>
        {change24h.hasData && (
          <div className={`font-mono text-xs mt-1 ${change24h.percentage >= 0 ? 'text-sf-green' : 'text-sf-pink'}`}>
            {formatPercent(change24h.percentage)} (24H)
          </div>
        )}
      </div>
    </aside>
  );
}
