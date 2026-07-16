import { pushEvent } from '../../lib/events.ts';
import { logger } from '../../lib/logger.ts';
import type { SteamPhase, SteamPhaseDetail } from '../../../shared/types/api.ts';

/**
 * Single source of truth for "what is the Steam side doing right now".
 * Kept out of steam.client.ts / inventory.service.ts so both can import it
 * without a dependency cycle.
 *
 * Ownership rules (the tricky part): refresh() logs Steam out as soon as the
 * inventory extraction is done, while its price pass keeps running. The
 * resulting 'disconnected'/'logout' events (owner 'steam') must NOT reset the
 * phase to idle while the refresh pipeline still owns it.
 */
export type PhaseOwner = 'steam' | 'refresh' | 'prices';

interface PhaseState {
  phase: SteamPhase;
  owner: PhaseOwner;
  steamId: string | null;
  detail: SteamPhaseDetail | null;
  since: string;
}

let state: PhaseState = {
  phase: 'idle',
  owner: 'steam',
  steamId: null,
  detail: null,
  since: new Date().toISOString(),
};

export interface SetPhaseOptions {
  owner?: PhaseOwner;
  steamId?: string | null;
  detail?: SteamPhaseDetail | null;
}

export function setPhase(phase: SteamPhase, opts: SetPhaseOptions = {}): void {
  const owner = opts.owner ?? 'steam';

  // A running refresh owns the phase: only the refresh pipeline may move it.
  if (state.owner === 'refresh' && state.phase !== 'idle' && owner !== 'refresh') {
    return;
  }
  // A standalone price refresh may only claim the phase from idle, and only
  // release its own claim — it must never clobber a login or a full refresh.
  if (owner === 'prices' && state.phase !== 'idle' && state.owner !== 'prices') {
    return;
  }

  const changed = state.phase !== phase;
  state = {
    phase,
    // idle is neutral ground: reset ownership so the next claimant can take it.
    owner: phase === 'idle' ? 'steam' : owner,
    steamId: phase === 'idle' ? null : (opts.steamId !== undefined ? opts.steamId : state.steamId),
    detail: opts.detail !== undefined ? opts.detail : (changed ? null : state.detail),
    since: changed ? new Date().toISOString() : state.since,
  };

  if (changed) {
    logger.debug(`[Steam] Phase -> ${phase}${state.steamId ? ` (${state.steamId})` : ''}`);
    pushEvent('phase_changed', { phase, steamId: state.steamId });
  }
}

/** Update progress detail of the current phase without emitting an event. */
export function updatePhaseDetail(detail: SteamPhaseDetail): void {
  state = { ...state, detail: { ...state.detail, ...detail } };
}

export function getPhaseState(): Readonly<PhaseState> {
  return state;
}
