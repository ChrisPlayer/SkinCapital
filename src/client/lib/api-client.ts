import type {
  AuthStatus,
  DashboardData,
  InventoryStatus,
  PriceDetail,
  Profile,
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
      request<{ success?: boolean; needsSteamGuard?: boolean; error?: string; profile?: Profile }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    steamGuard: (code: string) =>
      request<{ success: boolean; profile?: Profile }>('/auth/steamguard', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
    status: () => request<AuthStatus>('/auth/status'),
  },

  profiles: {
    list: () => request<Profile[]>('/profiles'),
    get: (steamId: string) => request<Profile>(`/profiles/${steamId}`),
  },

  dashboard: (steamId: string, days?: number, source: 'steam' | 'csfloat' = 'steam') =>
    request<DashboardData>(
      `/dashboard?steamId=${steamId}${days ? `&days=${days}` : ''}&source=${source}`,
    ),

  inventory: {
    refresh: () =>
      request<{ message: string; steamId: string }>('/inventory/refresh', { method: 'POST' }),
    status: (steamId?: string, source: 'steam' | 'csfloat' = 'steam') =>
      request<InventoryStatus>(
        `/inventory/status?source=${source}${steamId ? `&steamId=${steamId}` : ''}`,
      ),
  },

  prices: {
    get: (marketHashName: string, source: 'steam' | 'csfloat' = 'steam') =>
      request<PriceDetail>(`/prices/${encodeURIComponent(marketHashName)}?source=${source}`),
    refresh: (
      steamId: string,
      source: 'steam' | 'csfloat' = 'steam',
      scope: 'all' | 'stale_or_missing' | 'missing' = 'stale_or_missing',
    ) =>
      request<{
        message: string;
        steamId: string;
        source: 'steam' | 'csfloat';
        scope: 'all' | 'stale_or_missing' | 'missing';
      }>(
        `/prices/refresh?steamId=${steamId}&source=${source}&scope=${scope}`,
        { method: 'POST' },
      ),
    cancel: (steamId: string) =>
      request<{ cancelled: boolean }>(`/prices/cancel?steamId=${steamId}`, { method: 'POST' }),
  },

  export: {
    csvUrl: (steamId: string) => `${BASE}/export/csv?steamId=${steamId}`,
  },
};
