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
    refetchInterval: 30000,
  });
}

export function useOverview() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: () => api.overview(),
    refetchInterval: 30000,
  });
}

export function useDashboardData(
  steamId: string,
  days: number = 30,
  source: 'steam' | 'csfloat' | 'skinport' = 'steam',
  isRefreshing: boolean = false,
) {
  return useQuery({
    queryKey: ['dashboard', steamId, days, source],
    queryFn: () => api.dashboard(steamId, days, source),
    enabled: !!steamId,
    refetchInterval: isRefreshing ? 5000 : 60000,
    // Keep showing the previous days/source data while the new key loads, so
    // toggling 7/30/90 or the price source never flashes the full skeleton.
    placeholderData: (prev) => prev,
  });
}

export function useInventoryStatus(steamId?: string, source: 'steam' | 'csfloat' | 'skinport' = 'steam') {
  return useQuery({
    queryKey: ['inventory-status', steamId ?? 'all', source],
    queryFn: () => api.inventory.status(steamId, source),
    enabled: !!steamId,
    // Poll fast (3s) only while a refresh is running; otherwise back off to 20s
    // so the API isn't hammered when idle. A new refresh started here invalidates
    // this query, so the fast cadence resumes immediately.
    refetchInterval: (query) => (query.state.data?.isRefreshing ? 3000 : 20000),
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
      source: 'steam' | 'csfloat' | 'skinport';
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

export function usePricingSettings() {
  return useQuery({
    queryKey: ['pricing-settings'],
    queryFn: () => api.settings.getPricing(),
  });
}

export function useSetPricingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { mode?: 'auto' | 'proxy' | 'direct'; proxies?: string }) =>
      api.settings.setPricing(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-settings'] });
    },
  });
}

export function useResetPricingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.settings.resetPricing(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing-settings'] });
    },
  });
}

export function useTestProxy() {
  return useMutation({
    mutationFn: (proxy: string) => api.settings.testProxy(proxy),
  });
}

export function useSchedule() {
  return useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.settings.getSchedule(),
  });
}

export function useSetSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { enabled: boolean; hour: number; minute: number }) =>
      api.settings.setSchedule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
    },
  });
}

export function useRunScheduleNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.settings.runScheduleNow(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-status'] });
    },
  });
}

export function useBackupSettings() {
  return useQuery({
    queryKey: ['backup-settings'],
    queryFn: () => api.settings.getBackup(),
  });
}

export function useSetBackupSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { enabled: boolean }) => api.settings.setBackup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
    },
  });
}

export function useRunBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.settings.runBackup(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
      queryClient.invalidateQueries({ queryKey: ['backup-list'] });
    },
  });
}

export function useBackupList(enabled: boolean) {
  return useQuery({
    queryKey: ['backup-list'],
    queryFn: () => api.settings.listBackups(),
    enabled,
  });
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: string) => api.settings.restoreBackup(file),
    // A restore replaces profiles/items/history/settings wholesale — every
    // cached query is potentially stale.
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (steamId: string) => api.profiles.remove(steamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useSetPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { steamId: string; marketHashName: string; buyPriceEur: number }) =>
      api.purchases.set(params.steamId, params.marketHashName, params.buyPriceEur),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRemovePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { steamId: string; marketHashName: string }) =>
      api.purchases.remove(params.steamId, params.marketHashName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useTrackedSources() {
  return useQuery({
    queryKey: ['tracked-sources'],
    queryFn: () => api.settings.getSources(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetTrackedSources() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sources: Array<'steam' | 'csfloat' | 'skinport'>) => api.settings.setSources(sources),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracked-sources'] });
    },
  });
}

export function usePriceComparison(steamId: string, enabled = true) {
  return useQuery({
    queryKey: ['price-compare', steamId],
    queryFn: () => api.prices.compare(steamId),
    enabled: !!steamId && enabled,
    staleTime: 60 * 1000,
  });
}

export function useInventoryMovements(steamId: string, limit = 50) {
  return useQuery({
    queryKey: ['inventory-movements', steamId, limit],
    queryFn: () => api.inventory.movements(steamId, limit),
    enabled: !!steamId,
    refetchInterval: 60000,
  });
}

export function useAlerts(steamId: string) {
  return useQuery({
    queryKey: ['alerts', steamId],
    queryFn: () => api.alerts.list(steamId),
    enabled: !!steamId,
    refetchInterval: 60000,
  });
}

export function useCreateAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      steamId: string;
      marketHashName: string;
      direction: 'above' | 'below';
      thresholdEur: number;
    }) => api.alerts.create(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useDeleteAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: number; steamId: string }) => api.alerts.remove(params.id, params.steamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useMovers(
  steamId: string,
  source: 'steam' | 'csfloat' | 'skinport' = 'steam',
  days: 7 | 30 = 7,
) {
  return useQuery({
    queryKey: ['movers', steamId, source, days],
    queryFn: () => api.movers(steamId, source, days),
    enabled: !!steamId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTrends(
  source: 'steam' | 'csfloat' | 'skinport' = 'steam',
  days: 7 | 30 = 7,
) {
  return useQuery({
    queryKey: ['trends', source, days],
    queryFn: () => api.trends(source, days),
    staleTime: 5 * 60 * 1000,
  });
}

export function useItemPrice(marketHashName: string, source: 'steam' | 'csfloat' | 'skinport' = 'steam') {
  return useQuery({
    queryKey: ['price', marketHashName, source],
    queryFn: () => api.prices.get(marketHashName, source),
    enabled: !!marketHashName,
  });
}
