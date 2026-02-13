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

  dashboard: (steamId: string, days?: number) =>
    request<DashboardData>(`/dashboard?steamId=${steamId}${days ? `&days=${days}` : ''}`),

  inventory: {
    refresh: () =>
      request<{ message: string; steamId: string }>('/inventory/refresh', { method: 'POST' }),
    status: () => request<InventoryStatus>('/inventory/status'),
  },

  prices: {
    get: (marketHashName: string) =>
      request<PriceDetail>(`/prices/${encodeURIComponent(marketHashName)}`),
    refresh: (steamId: string) =>
      request<{ message: string; steamId: string }>(`/prices/refresh?steamId=${steamId}`, { method: 'POST' }),
  },

  export: {
    csvUrl: (steamId: string) => `${BASE}/export/csv?steamId=${steamId}`,
  },
};
