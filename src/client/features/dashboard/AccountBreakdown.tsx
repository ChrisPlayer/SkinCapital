import { useNavigate } from 'react-router-dom';
import { useI18n, type PriceProvider } from '../../lib/i18n.tsx';
import { useProfiles } from '../../hooks/useApi.ts';
import { formatEur } from '../../lib/formatters.ts';
import { SECTION_TITLE, activationKeyDown } from './shared.ts';

/** Aggregated view only: one row per account with its share of the total. */
export function AccountBreakdown({ pp }: { pp: PriceProvider }) {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const { data: profiles } = useProfiles();

  const rows = (profiles ?? []).filter((p) => p.itemCount > 0 || p.totalValue > 0);
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, p) => sum + p.totalValue, 0);
  const sorted = [...rows].sort((a, b) => b.totalValue - a.totalValue);
  const pctFormat = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  });

  return (
    <section className="sf-card p-6 mb-8">
      <div className={`${SECTION_TITLE} mb-4`}>{t('dashboard.accountBreakdown')}</div>
      <div className="space-y-1">
        {sorted.map((profile) => {
          const share = total > 0 ? profile.totalValue / total : 0;
          const open = () => navigate(`/profile/${profile.steamId}`);
          return (
            <div
              key={profile.steamId}
              role="button"
              tabIndex={0}
              onClick={open}
              onKeyDown={activationKeyDown(open)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-white/[0.04] transition-colors"
            >
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-semibold text-gray-400 shrink-0">
                  {(profile.personaName ?? profile.username).charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-white truncate">
                  {profile.personaName ?? profile.username}
                </div>
                <div className="mt-1 h-[3px] rounded-full bg-white/[0.05]" aria-hidden="true">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${share * 100}%`,
                      background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 25%, transparent), var(--accent))',
                    }}
                  />
                </div>
              </div>
              <span className="font-mono text-sm font-bold text-white shrink-0 tabular-nums">
                {formatEur(profile.totalValue, pp)}
              </span>
              <span className="font-mono text-xs text-gray-500 w-14 text-right shrink-0 tabular-nums">
                {pctFormat.format(share)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
