/**
 * Virtual steamId for the aggregated "all accounts" view. SteamID64 values are
 * purely numeric, so this can never collide with a real profile.
 */
export const ALL_PROFILES_ID = 'all';

export function isAllProfiles(steamId: string | undefined | null): boolean {
  return steamId === ALL_PROFILES_ID;
}
