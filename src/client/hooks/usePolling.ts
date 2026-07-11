import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryStatus } from './useApi.ts';
import type { RefreshOutcome } from '../../shared/types/api.ts';

export function useRefreshPolling(
  steamId?: string,
  source: 'steam' | 'csfloat' | 'skinport' = 'steam',
  onComplete?: () => void,
  // Called when a FULL inventory refresh (not a price refresh) just ended, with
  // the server-reported outcome — lets the page explain a refresh that changed
  // nothing (e.g. the anti-wipe abort) instead of silently stopping the spinner.
  onInventoryRefreshDone?: (outcome: RefreshOutcome | null) => void,
) {
  const { data } = useInventoryStatus(steamId, source);
  const queryClient = useQueryClient();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onInventoryRefreshDoneRef = useRef(onInventoryRefreshDone);
  onInventoryRefreshDoneRef.current = onInventoryRefreshDone;

  const wasRefreshingRef = useRef(false);
  const isRefreshing = data?.isRefreshing ?? false;
  const lastOutcome = data?.lastOutcome ?? null;

  useEffect(() => {
    if (wasRefreshingRef.current && !isRefreshing) {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      // Refetch per-item price details so an open item modal shows fresh prices.
      queryClient.invalidateQueries({ queryKey: ['price'] });
      onCompleteRef.current?.();
    }
    wasRefreshingRef.current = isRefreshing;
  }, [isRefreshing, queryClient]);

  // Outcome notification keyed on lastOutcome.at CHANGING — not on the
  // isRefreshing transition, which the 3-20s poll can miss entirely when a
  // refresh fails fast (the toast would silently never fire). Seeded on mount
  // so a stale outcome from a previous session never re-toasts.
  const lastOutcomeAtRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const at = lastOutcome?.at ?? null;
    if (lastOutcomeAtRef.current === undefined) {
      lastOutcomeAtRef.current = at;
      return;
    }
    if (at !== lastOutcomeAtRef.current) {
      lastOutcomeAtRef.current = at;
      if (at) onInventoryRefreshDoneRef.current?.(lastOutcome);
    }
  }, [lastOutcome]);

  return {
    isRefreshing,
    syncType: data?.syncType ?? null,
    source: data?.source ?? null,
    lastRefresh: data?.lastRefresh ?? null,
    progress: data?.progress ?? null,
    lastOutcome,
  };
}
