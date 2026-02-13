import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryStatus } from './useApi.ts';

export function useRefreshPolling(onComplete?: () => void) {
  const { data } = useInventoryStatus();
  const queryClient = useQueryClient();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const wasRefreshingRef = useRef(false);
  const isRefreshing = data?.isRefreshing ?? false;

  useEffect(() => {
    if (wasRefreshingRef.current && !isRefreshing) {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      onCompleteRef.current?.();
    }
    wasRefreshingRef.current = isRefreshing;
  }, [isRefreshing, queryClient]);

  return {
    isRefreshing,
    lastRefresh: data?.lastRefresh ?? null,
  };
}
