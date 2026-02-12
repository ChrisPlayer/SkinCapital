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

export function useDashboardData(days: number = 30) {
  return useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => api.dashboard(days),
    refetchInterval: 60000,
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

export function useItemPrice(marketHashName: string) {
  return useQuery({
    queryKey: ['price', marketHashName],
    queryFn: () => api.prices(marketHashName),
    enabled: !!marketHashName,
  });
}
