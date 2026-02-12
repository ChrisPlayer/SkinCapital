import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryStatus } from './useApi.ts';

export function useRefreshPolling(onComplete?: () => void) {
  const { data } = useInventoryStatus();
  const queryClient = useQueryClient();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const isRefreshing = data?.isRefreshing ?? false;

  useEffect(() => {
    if (data && !isRefreshing) {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onCompleteRef.current?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRefreshing]);

  return {
    isRefreshing,
    lastRefresh: data?.lastRefresh ?? null,
  };
}
