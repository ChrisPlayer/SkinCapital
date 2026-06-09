import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryStatus } from './useApi.ts';

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
  };
}
