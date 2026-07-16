import { useI18n, type TranslationKey } from '../lib/i18n.tsx';
import { useProfiles } from '../hooks/useApi.ts';
import type { SteamStatusInfo, RefreshProgress, SteamPhase } from '../../shared/types/api.ts';

const PHASE_LABEL_KEYS: Partial<Record<SteamPhase, TranslationKey>> = {
  logging_in: 'status.phase.logging_in',
  awaiting_steam_guard: 'status.phase.awaiting_steam_guard',
  launching_cs2: 'status.phase.launching_cs2',
  fetching_inventory: 'status.phase.fetching_inventory',
  fetching_storage: 'status.phase.fetching_storage',
  fetching_prices: 'status.phase.fetching_prices',
  disconnecting: 'status.phase.disconnecting',
};

interface AccountStatusProps {
  steamId: string;
  steam: SteamStatusInfo | null;
  progress: RefreshProgress | null;
  compact?: boolean;
}

/**
 * Live account widget: avatar + persona name + what is happening on the
 * account right now. Three visual states:
 * - working: accent ring (pulse) + phase label with progress
 * - connected: static accent ring + dot
 * - disconnected: no ring, desaturated avatar, plain gray label — deliberately
 *   quiet (no background, no red).
 */
export function AccountStatus({ steamId, steam, progress, compact = false }: AccountStatusProps) {
  const { t } = useI18n();
  const { data: profiles } = useProfiles();

  // The enriched status carries identity while a session/refresh is active;
  // fall back to the cached profile list otherwise.
  const targetId = steam?.steamId ?? steamId;
  const cachedProfile = profiles?.find((p) => p.steamId === targetId);
  const personaName = steam?.profile?.personaName ?? cachedProfile?.personaName ?? cachedProfile?.username ?? targetId;
  const avatarUrl = steam?.profile?.avatarUrl ?? cachedProfile?.avatarUrl ?? null;

  const phase = steam?.phase ?? 'idle';
  const working = phase !== 'idle' && phase !== 'connected';
  const connected = phase === 'connected' || (steam?.isLoggedIn ?? false);

  let statusText: string;
  if (working) {
    const key = PHASE_LABEL_KEYS[phase];
    statusText = key ? t(key) : phase;
    if (phase === 'fetching_storage' && steam?.phaseDetail) {
      const { waitingForGC, loadedUnits, totalUnits } = steam.phaseDetail;
      if (waitingForGC) statusText = t('status.phase.waiting_gc');
      else if (totalUnits && totalUnits > 0) statusText += ` ${loadedUnits ?? 0}/${totalUnits}`;
    } else if (progress && progress.total > 0) {
      statusText += ` ${progress.fetched}/${progress.total}`;
    }
  } else if (connected) {
    statusText = t('status.connected');
  } else {
    statusText = t('status.disconnected');
  }

  const ringClass = working
    ? 'ring-2 ring-[color:var(--accent)] motion-safe:animate-pulse'
    : connected
      ? 'ring-2 ring-[color:var(--accent)]'
      : '';
  const avatarDim = working || connected ? '' : 'opacity-60 saturate-50';
  const initial = (personaName || '?').charAt(0).toUpperCase();
  const size = compact ? 'w-8 h-8' : 'w-9 h-9';

  const avatar = (
    <span className={`relative inline-flex shrink-0 rounded-full transition-[box-shadow,opacity] duration-300 ${ringClass}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={personaName}
          className={`${size} rounded-full object-cover transition-[filter,opacity] duration-300 ${avatarDim}`}
        />
      ) : (
        <span className={`${size} rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-semibold text-gray-400 ${avatarDim}`}>
          {initial}
        </span>
      )}
      {connected && !working && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[color:var(--accent)] border border-black"
          aria-hidden="true"
        />
      )}
    </span>
  );

  if (compact) {
    return (
      <span title={`${personaName} — ${statusText}`} className="inline-flex items-center">
        {avatar}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {avatar}
      <div className="min-w-0 leading-tight">
        <div className="text-[13px] font-semibold text-white truncate">{personaName}</div>
        <div
          key={statusText}
          className={`fade-up font-mono text-[11px] truncate ${
            working ? 'text-[color:var(--accent)]' : connected ? 'text-[color:var(--accent)]' : 'text-gray-500'
          }`}
        >
          {statusText}
        </div>
      </div>
    </div>
  );
}
