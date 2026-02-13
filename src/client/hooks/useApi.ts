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
  isRefreshing: boolean = false,
) {
  return useQuery({
    queryKey: ['dashboard', steamId, days],
    queryFn: () => api.dashboard(steamId, days),
    enabled: !!steamId,
    refetchInterval: isRefreshing ? 5000 : 60000,
  });
}

export function useInventoryStatus() {
  return useQuery({
    queryKey: ['inventory-status'],
    queryFn: () => api.inventory.status(),
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
    mutationFn: (steamId: string) => api.prices.refresh(steamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-status'] });
    },
  });
}

export function useItemPrice(marketHashName: string) {
  return useQuery({
    queryKey: ['price', marketHashName],
    queryFn: () => api.prices.get(marketHashName),
    enabled: !!marketHashName,
  });
}
