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
  totalItems: number;
  uniqueItems: number;
  totalValue: number;
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
  lastRefresh: string | null;
}

export interface PriceDetail {
  name: string;
  price: number | null;
  rawPrice: Price;
  change: ChangeInfo;
}

export interface ApiError {
  error: string;
}
