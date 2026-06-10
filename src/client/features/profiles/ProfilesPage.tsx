import { useNavigate } from 'react-router-dom';
import { useProfiles, useOverview } from '../../hooks/useApi.ts';
import { useI18n } from '../../lib/i18n.tsx';
import { useCountUp } from '../../hooks/useCountUp.ts';
import { formatEur, formatDate } from '../../lib/formatters.ts';
import type { Overview } from '../../../shared/types/api.ts';
import { getDisplayItemName } from '../../lib/item-display.ts';
import { Plus, LogIn, Package, Loader2, Wallet, Users } from 'lucide-react';

const COUNT_FORMATTERS: Record<'fr' | 'en', Intl.NumberFormat> = {
  fr: new Intl.NumberFormat('fr-FR'),
  en: new Intl.NumberFormat('en-US'),
};

function OverviewBanner({ overview }: { overview: Overview }) {
  const { t, locale } = useI18n();
  const animatedTotal = useCountUp(overview.totalValue);
  const formatCount = (value: number) => COUNT_FORMATTERS[locale].format(value);
  // The top-items strip only adds value with more than one account; with a
  // single profile it just duplicates that profile's top assets.
  const showTopItems = overview.profileCount > 1 && overview.topItems.length > 0;

  return (
    <section className="sf-card relative overflow-hidden p-6 mb-8">
      <div
        className="pointer-events-none absolute -top-16 -left-12 w-96 h-56"
        style={{
          background:
            'radial-gradient(closest-side, color-mix(in srgb, var(--accent) 12%, transparent), transparent)',
        }}
      />
      <div className="relative">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">
          {t('overview.title')}
        </div>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Wallet className="w-3.5 h-3.5" />
              {t('overview.combinedValue')}
            </div>
            <div className="text-value-hero text-4xl tracking-tight font-bold tabular-nums">
              {formatEur(animatedTotal)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Package className="w-3.5 h-3.5" />
              {t('overview.totalItems')}
            </div>
            <div className="font-mono text-2xl font-bold">{formatCount(overview.totalItems)}</div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <Users className="w-3.5 h-3.5" />
              {t('overview.accounts')}
            </div>
            <div className="font-mono text-2xl font-bold">{formatCount(overview.profileCount)}</div>
          </div>
        </div>

        {showTopItems && (
          <div className="mt-6">
            <div className="text-xs text-gray-500 mb-2">{t('overview.topItems')}</div>
            <div className="flex flex-wrap gap-2">
              {overview.topItems.map((it) => (
                <div
                  key={it.marketHashName}
                  title={getDisplayItemName(it.marketHashName)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                >
                  {it.imageUrl ? (
                    <img
                      src={it.imageUrl}
                      alt={it.marketHashName}
                      loading="lazy"
                      className="w-7 h-7 rounded object-contain"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded bg-white/[0.04]" aria-hidden="true" />
                  )}
                  <span className="font-mono text-xs font-bold text-sf-cyan">
                    {formatEur(it.totalValue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-500 mt-4">{t('overview.itemsOnly')}</p>
      </div>
    </section>
  );
}

export function ProfilesPage() {
  const navigate = useNavigate();
  const { data: profiles, isLoading } = useProfiles();
  const { data: overview } = useOverview();
  const { t, locale } = useI18n();

  return (
    <div className="min-h-screen relative">
      <div className="grid-overlay" />

      <header className="relative z-10 border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-6 rounded-full bg-[color:var(--accent)] shadow-[0_0_10px_var(--accent)]" />
            <span className="font-display text-2xl font-bold">SkinCapital</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl btn-accent font-semibold text-sm glow-cyan"
          >
            <Plus className="w-4 h-4" />
            {t('profiles.addAccount')}
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-10">
        {overview && overview.profileCount >= 1 && <OverviewBanner overview={overview} />}

        <div className="mb-8">
          <h2 className="font-display text-2xl font-bold mb-1">{t('profiles.yourProfiles')}</h2>
          <span className="text-sm text-sf-dim">{t('profiles.selectProfile')}</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-sf-cyan" />
          </div>
        ) : profiles && profiles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <div
                key={profile.steamId}
                onClick={() => navigate(`/profile/${profile.steamId}`)}
                className="sf-card sf-card-hover p-6 cursor-pointer group"
              >
                <div className="flex items-center gap-3 mb-5">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.personaName || profile.username}
                      className="w-11 h-11 rounded-xl border border-sf-cyan/20 object-cover"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-sf-cyan/10 border border-sf-cyan/20 flex items-center justify-center font-display text-lg font-bold text-sf-cyan">
                      {(profile.personaName || profile.username).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate group-hover:text-sf-cyan transition-colors">
                      {profile.personaName || profile.username}
                    </p>
                    <p className="text-[10px] text-sf-dim font-mono">{profile.username}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="nav-label mb-1">{t('profiles.items')}</div>
                    <p className="font-mono text-base font-bold">{profile.itemCount}</p>
                  </div>
                  <div>
                    <div className="nav-label mb-1">{t('profiles.value')}</div>
                    <p className="font-mono text-base font-bold text-sf-cyan">{formatEur(profile.totalValue)}</p>
                  </div>
                </div>

                <div className="font-mono text-[10px] text-sf-dim">
                  {profile.lastRefresh
                    ? `${t('profiles.lastSync')}: ${formatDate(profile.lastRefresh, locale)}`
                    : t('profiles.neverSynced')}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sf-card p-16 text-center max-w-md mx-auto">
            <Package className="w-14 h-14 mx-auto text-sf-dim mb-5" />
            <h3 className="font-display text-xl font-bold mb-2">{t('profiles.noProfiles')}</h3>
            <p className="text-sm text-sf-secondary mb-6">
              {t('profiles.noProfilesDesc')}
            </p>
            <button
              onClick={() => navigate('/login')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl btn-accent font-semibold text-sm glow-cyan"
            >
              <LogIn className="w-4 h-4" />
              {t('auth.login')}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
