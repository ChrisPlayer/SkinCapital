import type {
  AuthStatus,
  DashboardData,
  InventoryStatus,
  PriceDetail,
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
    login: (data: { username: string; password: string; sharedSecret?: string }) =>
      request<{ success?: boolean; needsSteamGuard?: boolean; error?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    steamGuard: (code: string) =>
      request<{ success: boolean }>('/auth/steamguard', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
    status: () => request<AuthStatus>('/auth/status'),
  },

  dashboard: (days?: number) =>
    request<DashboardData>(`/dashboard${days ? `?days=${days}` : ''}`),

  inventory: {
    refresh: () =>
      request<{ message: string }>('/inventory/refresh', { method: 'POST' }),
    status: () => request<InventoryStatus>('/inventory/status'),
  },

  prices: (marketHashName: string) =>
    request<PriceDetail>(`/prices/${encodeURIComponent(marketHashName)}`),

  export: {
    csvUrl: () => `${BASE}/export/csv`,
  },
};
