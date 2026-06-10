import type {
  AuthStatus,
  DashboardData,
  InventoryStatus,
  PriceAlert,
  PriceDetail,
  Profile,
  MoversResponse,
  ApiError,
} from '../../shared/types/api.ts';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'Request failed' }))) as ApiError;
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    login: (data: { username: string; password: string }) =>
      request<{ success?: boolean; needsSteamGuard?: boolean; canConfirmMobile?: boolean; error?: string; profile?: Profile }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    steamGuard: (code: string) =>
      request<{ success: boolean; profile?: Profile }>('/auth/steamguard', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    // Poll for Steam mobile-app approval (no code typed).
    poll: () =>
      request<{ success?: boolean; profile?: Profile; pending?: boolean }>('/auth/poll', {
        method: 'POST',
      }),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
    status: () => request<AuthStatus>('/auth/status'),
  },

  profiles: {
    list: () => request<Profile[]>('/profiles'),
    get: (steamId: string) => request<Profile>(`/profiles/${encodeURIComponent(steamId)}`),
  },

  dashboard: (steamId: string, days?: number, source: 'steam' | 'csfloat' | 'skinport' = 'steam') =>
    request<DashboardData>(
      `/dashboard?steamId=${encodeURIComponent(steamId)}${days ? `&days=${encodeURIComponent(days)}` : ''}&source=${source}`,
    ),

  movers: (steamId: string, source: 'steam' | 'csfloat' | 'skinport' = 'steam', days: 7 | 30 = 7) =>
    request<MoversResponse>(
      `/movers?steamId=${encodeURIComponent(steamId)}&source=${source}&days=${days}`,
    ),

  inventory: {
    refresh: () =>
      request<{ message: string; steamId: string }>('/inventory/refresh', { method: 'POST' }),
    status: (steamId?: string, source: 'steam' | 'csfloat' | 'skinport' = 'steam') =>
      request<InventoryStatus>(
        `/inventory/status?source=${source}${steamId ? `&steamId=${encodeURIComponent(steamId)}` : ''}`,
      ),
  },

  prices: {
    get: (marketHashName: string, source: 'steam' | 'csfloat' | 'skinport' = 'steam') =>
      request<PriceDetail>(`/prices/${encodeURIComponent(marketHashName)}?source=${source}`),
    refresh: (
      steamId: string,
      source: 'steam' | 'csfloat' | 'skinport' = 'steam',
      scope: 'all' | 'stale_or_missing' | 'missing' = 'stale_or_missing',
    ) =>
      request<{
        message: string;
        steamId: string;
        source: 'steam' | 'csfloat' | 'skinport';
        scope: 'all' | 'stale_or_missing' | 'missing';
      }>(
        `/prices/refresh?steamId=${encodeURIComponent(steamId)}&source=${source}&scope=${scope}`,
        { method: 'POST' },
      ),
    cancel: (steamId: string) =>
      request<{ cancelled: boolean }>(`/prices/cancel?steamId=${encodeURIComponent(steamId)}`, { method: 'POST' }),
  },

  purchases: {
    set: (steamId: string, marketHashName: string, buyPriceEur: number) =>
      request<{ ok: boolean }>('/purchases', {
        method: 'PUT',
        body: JSON.stringify({ steamId, marketHashName, buyPriceEur }),
      }),
    remove: (steamId: string, marketHashName: string) =>
      request<{ ok: boolean }>(
        `/purchases?steamId=${encodeURIComponent(steamId)}&marketHashName=${encodeURIComponent(marketHashName)}`,
        { method: 'DELETE' },
      ),
  },

  alerts: {
    list: (steamId: string) => request<PriceAlert[]>(`/alerts?steamId=${encodeURIComponent(steamId)}`),
    create: (data: { steamId: string; marketHashName: string; direction: 'above' | 'below'; thresholdEur: number }) =>
      request<PriceAlert>('/alerts', { method: 'POST', body: JSON.stringify(data) }),
    remove: (id: number, steamId: string) =>
      request<{ ok: boolean }>(`/alerts/${id}?steamId=${encodeURIComponent(steamId)}`, { method: 'DELETE' }),
  },

  export: {
    csvUrl: (steamId: string) => `${BASE}/export/csv?steamId=${encodeURIComponent(steamId)}`,
  },

  settings: {
    getPricing: () =>
      request<{ mode: 'auto' | 'proxy' | 'direct'; resolvedMode: 'proxy' | 'direct'; proxiesMasked: string[]; proxyCount: number }>(
        '/settings/pricing',
      ),
    setPricing: (data: { mode?: 'auto' | 'proxy' | 'direct'; proxies?: string }) =>
      request<{ ok: boolean; mode: string; resolvedMode: 'proxy' | 'direct'; proxyCount: number }>(
        '/settings/pricing',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    resetPricing: () =>
      request<{ ok: boolean; mode: string; resolvedMode: 'proxy' | 'direct'; proxyCount: number }>(
        '/settings/pricing',
        { method: 'DELETE' },
      ),
    testProxy: (proxy: string) =>
      request<{ ok: boolean; ip?: string; error?: string }>('/settings/pricing/test', {
        method: 'POST',
        body: JSON.stringify({ proxy }),
      }),
    getSchedule: () =>
      request<{ enabled: boolean; hour: number; minute: number }>('/settings/schedule'),
    setSchedule: (data: { enabled: boolean; hour: number; minute: number }) =>
      request<{ ok: boolean; enabled: boolean; hour: number; minute: number }>('/settings/schedule', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    runScheduleNow: () =>
      request<{ ok: boolean; started: boolean }>('/settings/schedule/run', { method: 'POST' }),
  },
};
