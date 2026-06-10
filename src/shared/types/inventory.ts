export interface Item {
  id: number;
  marketHashName: string;
  assetId: string | null;
  casketId: string | null;
  casketName: string | null;
  floatValue: number | null;
  paintSeed: number | null;
  iconUrl: string | null;
  stickers: Sticker[] | null;
  schemaImage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Sticker {
  slot: number;
  stickerId: number;
  name: string;
  imageUrl: string | null;
  wear: number | null;
}

export interface ItemGroup {
  marketHashName: string;
  quantity: number;
  items: Item[];
  casketIds: string[];
  floatValue: number | null;
  /** Paint seed of the representative unit (for rare-pattern detection). */
  paintSeed: number | null;
  wear: WearLevel | null;
  rarity: Rarity;
  quality: 'stattrak' | 'souvenir' | null;
  imageUrl: string | null;
  price: number | null;
  total: number;
  stickers: Sticker[];
  stickerValue: number;
  priceChange: number | null;
  priceChangePercent: number | null;
  /** Purchase price per unit for this profile (null when not set). */
  buyPrice: number | null;
}

export interface StorageUnit {
  casketId: string;
  name: string;
  shortId: string;
  imageUrl: string | null;
  itemCount: number;
  uniqueItems: number;
  totalValue: number;
  items: ItemGroup[];
}

export interface Price {
  steam: number | null;
  csfloat: number | null;
  skinport: number | null;
  average: number | null;
  timestamp: string | null;
}

export interface Rarity {
  name: string;
  color: string;
  bg: string;
}

export interface WearLevel {
  name: string;
  short: string;
  color: string;
}
