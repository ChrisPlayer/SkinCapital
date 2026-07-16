import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryStatus } from './useApi.ts';
import type { SteamStatusInfo, RefreshOutcome } from '../../shared/types/api.ts';

// Refresh-outcome NOTIFICATIONS (toasts) live in useEventToasts — the event
// journal can't miss a fast refresh the way this poll's transition can. This
// hook keeps: spinner state, steam phase widget data, query invalidation on
// completion, and the last outcome for pages that render it statically.
export function useRefreshPolling(
  steamId?: string,
  source: 'steam' | 'csfloat' | 'skinport' = 'steam',
  onComplete?: () => void,
) {
  const { data } = useInventoryStatus(steamId, source);
  const queryClient = useQueryClient();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const wasRefreshingRef = useRef(false);
  const isRefreshing = data?.isRefreshing ?? false;

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

  return {
    isRefreshing,
    syncType: data?.syncType ?? null,
    source: data?.source ?? null,
    lastRefresh: data?.lastRefresh ?? null,
    progress: data?.progress ?? null,
    steam: (data?.steam ?? null) as SteamStatusInfo | null,
    lastOutcome: (data?.lastOutcome ?? null) as RefreshOutcome | null,
  };
}
