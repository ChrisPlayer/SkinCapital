import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client.ts';

export function useAuthStatus() {
  return useQuery({
    queryKey: ['auth-status'],
    queryFn: () => api.auth.status(),
    retry: false,
    refetchInterval: 30000,
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.profiles.list(),
    refetchInterval: 10000,
  });
}

export function useDashboardData(
  steamId: string,
  days: number = 30,
  source: 'steam' | 'csfloat' = 'steam',
  isRefreshing: boolean = false,
) {
  return useQuery({
    queryKey: ['dashboard', steamId, days, source],
    queryFn: () => api.dashboard(steamId, days, source),
    enabled: !!steamId,
    refetchInterval: isRefreshing ? 5000 : 60000,
  });
}

export function useInventoryStatus(steamId?: string, source: 'steam' | 'csfloat' = 'steam') {
  return useQuery({
    queryKey: ['inventory-status', steamId ?? 'all', source],
    queryFn: () => api.inventory.status(steamId, source),
    refetchInterval: 3000,
  });
}

export function useRefreshInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.inventory.refresh(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-status'] });
    },
  });
}

export function useRefreshPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      steamId: string;
      source: 'steam' | 'csfloat';
      scope?: 'all' | 'stale_or_missing' | 'missing';
    }) =>
      api.prices.refresh(params.steamId, params.source, params.scope ?? 'stale_or_missing'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-status'] });
    },
  });
}

export function useCancelPriceRefresh() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (steamId: string) => api.prices.cancel(steamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-status'] });
    },
  });
}

export function useItemPrice(marketHashName: string, source: 'steam' | 'csfloat' = 'steam') {
  return useQuery({
    queryKey: ['price', marketHashName, source],
    queryFn: () => api.prices.get(marketHashName, source),
    enabled: !!marketHashName,
  });
}
