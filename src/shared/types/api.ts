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

export interface InventoryStatus {
  isRefreshing: boolean;
  syncType: 'inventory' | 'prices' | null;
  source: 'steam' | 'csfloat' | 'skinport' | null;
  lastRefresh: string | null;
  progress: RefreshProgress | null;
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
