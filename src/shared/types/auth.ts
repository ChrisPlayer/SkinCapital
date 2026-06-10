export interface AuthStatus {
  isLoggedIn: boolean;
  isConnectedToGC: boolean;
  steamId: string | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface SteamGuardRequest {
  code: string;
}
