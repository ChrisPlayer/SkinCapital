import type { AuthStatus, LoginRequest, SteamGuardRequest } from './auth.ts';
import type { ItemGroup, StorageUnit, WearLevel, Rarity, Price } from './inventory.ts';

export type { AuthStatus, LoginRequest, SteamGuardRequest };
export type { ItemGroup, StorageUnit, WearLevel, Rarity, Price };

export interface Profile {
  id: number;
  steamId: string;
  username: string;
  personaName: string | null;
  avatarUrl: string | null;
  itemCount: number;
  totalValue: number;
  lastRefresh: string | null;
}

export interface OverviewTopItem {
  marketHashName: string;
  totalValue: number;
  imageUrl: string | null;
}

export interface Overview {
  totalValue: number;
  totalItems: number;
  profileCount: number;
  topItems: OverviewTopItem[];
}

export interface DashboardData {
  items: ItemGroup[];
  mainInventory: {
    items: ItemGroup[];
    total: number;
    count: number;
  };
  storageUnits: StorageUnit[];
  emptyStorageUnits: number;
  totalItems: number;
  uniqueItems: number;
  totalValue: number;
  /** Sum of buyPrice x quantity over groups with a purchase price (null when no purchases). */
  invested: number | null;
  /** Sum of (group.total - buyPrice x quantity) over those groups (null when no purchases). */
  pnl: number | null;
  change24h: ChangeInfo;
  historyData: HistoryPoint[];
  dailyHistory: DailyHistoryEntry[];
  priceWindow: { from: string; to: string } | null;
}

export interface HistoryPoint {
  date: string;
  value: number;
  itemCount: number;
}

export interface DailyHistoryEntry extends HistoryPoint {
  change: number;
  changePercent: number;
}

export interface ChangeInfo {
  change: number;
  percentage: number;
  hasData: boolean;
  yesterdayValue?: number;
}

/** What the Steam client / refresh pipeline is doing right now. */
export type SteamPhase =
  | 'idle'
  | 'logging_in'
  | 'awaiting_steam_guard'
  | 'launching_cs2'
  | 'connected'
  | 'fetching_inventory'
  | 'fetching_storage'
  | 'fetching_prices'
  | 'disconnecting';

export interface SteamPhaseDetail {
  loadedUnits?: number;
  totalUnits?: number;
  waitingForGC?: boolean;
}

export interface SteamStatusInfo {
  phase: SteamPhase;
  phaseSince: string;
  phaseDetail: SteamPhaseDetail | null;
  /** Account the phase applies to (survives the mid-refresh Steam logout). */
  steamId: string | null;
  profile: { username: string; personaName: string | null; avatarUrl: string | null } | null;
  isLoggedIn: boolean;
  isConnectedToGC: boolean;
}

export interface LastRefreshResult {
  success: boolean;
  itemCount?: number;
  totalValue?: number;
  error?: string;
  finishedAt: string;
}

export interface InventoryStatus {
  isRefreshing: boolean;
  syncType: 'inventory' | 'prices' | null;
  source: 'steam' | 'csfloat' | 'skinport' | null;
  lastRefresh: string | null;
  progress: RefreshProgress | null;
  steam: SteamStatusInfo;
  lastRefreshResult: LastRefreshResult | null;
}

export type AppEventType =
  | 'phase_changed'
  | 'refresh_completed'
  | 'refresh_failed'
  | 'price_refresh_completed'
  | 'alert_triggered'
  | 'logged_in'
  | 'logged_out'
  | 'inventory_changed';

export interface AppEvent {
  seq: number;
  type: AppEventType;
  at: string;
  payload: Record<string, unknown>;
}

export interface EventsResponse {
  bootId: string;
  lastSeq: number;
  events: AppEvent[];
}

export interface InventoryMovement {
  id: number;
  steamId: string;
  marketHashName: string;
  /** Positive = items gained, negative = items removed. */
  delta: number;
  priceEur: number | null;
  createdAt: string;
}

export interface RefreshProgress {
  fetched: number;
  total: number;
}

export interface PriceAlert {
  id: number;
  steamId: string;
  marketHashName: string;
  direction: 'above' | 'below';
  thresholdEur: number;
  triggeredAt: string | null;
  createdAt: string;
  /** Latest cached Steam price for the item (null when never priced). */
  currentPrice: number | null;
}

export interface Mover {
  name: string;
  oldPrice: number;
  newPrice: number;
  changePct: number;
}

export interface MoversResponse {
  days: number;
  gainers: Mover[];
  losers: Mover[];
}

export interface PriceDetail {
  name: string;
  price: number | null;
  rawPrice: Price;
  change: ChangeInfo;
  /** 30-day raw price points for the selected source (sparkline). */
  history: Array<{ date: string; price: number }>;
}

export interface ApiError {
  error: string;
}
