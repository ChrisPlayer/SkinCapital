// Type declarations for Steam libraries (no official @types)

declare module 'steam-user' {
  import { EventEmitter } from 'events';

  interface SteamUserOptions {
    autoRelogin?: boolean;
    enablePicsCache?: boolean;
  }

  interface LogOnOptions {
    accountName: string;
    password: string;
    twoFactorCode?: string;
  }

  interface PersonaData {
    player_name?: string;
    avatar_url_icon?: string;
    avatar_url_medium?: string;
    avatar_url_full?: string;
    avatar_hash?: Buffer;
    [key: string]: unknown;
  }

  class SteamUser extends EventEmitter {
    steamID: { getSteamID64(): string } | null;
    constructor(options?: SteamUserOptions);
    logOn(options: LogOnOptions): void;
    logOff(): void;
    gamesPlayed(apps: number[]): void;
    setPersona(state: number): void;
    getPersonas(
      steamIds: string[],
      callback: (err: Error | null, personas: Record<string, PersonaData>) => void,
    ): void;
  }

  export = SteamUser;
}

declare module 'steamcommunity' {
  import { EventEmitter } from 'events';

  class SteamCommunity extends EventEmitter {
    setCookies(cookies: string[]): void;
    getUserInventoryContents(
      steamId: { getSteamID64(): string },
      appId: number,
      contextId: number,
      tradableOnly: boolean,
      callback: (err: Error | null, inventory: SteamInventoryItem[]) => void,
    ): void;
  }

  interface SteamInventoryItem {
    market_hash_name: string;
    assetid: string;
    icon_url: string;
    [key: string]: unknown;
  }

  export = SteamCommunity;
}

declare module 'globaloffensive' {
  import { EventEmitter } from 'events';
  import SteamUser from 'steam-user';

  interface GCItem {
    id?: string | number;
    def_index: number;
    paint_index?: number;
    quality?: number;
    paintwear?: number;
    paint_wear?: number;
    paintseed?: number;
    paint_seed?: number;
    casket_id?: string;
    casket_contained_item_count?: number;
    custom_name?: string;
    stickers?: Array<{
      slot: number;
      sticker_id?: number;
      kit?: number;
      id?: number;
      wear?: number;
    }>;
    attribute?: Array<{
      def_index: number;
      float_value?: number;
      uint32_value?: number;
      value?: number;
      value_bytes?: Buffer;
    }>;
    [key: string]: unknown;
  }

  class GlobalOffensive extends EventEmitter {
    inventory: GCItem[];
    constructor(steamUser: SteamUser);
    requestPlayersProfile(
      steamId: { getSteamID64(): string },
      callback: (profile: unknown) => void,
    ): void;
    requestPlayersProfile(
      steamId: { getSteamID64(): string },
      callback: (err: Error | null, profile: unknown) => void,
    ): void;
    getCasketContents(
      casketId: string,
      callback: (err: Error | null, items: GCItem[]) => void,
    ): void;
  }

  export = GlobalOffensive;
}

declare module 'steam-totp' {
  export function generateAuthCode(sharedSecret: string): string;
}

// node-cron >=4 ships its own type definitions (incl. destroy()) — the local
// 3.x shim that used to live here is gone on purpose.
