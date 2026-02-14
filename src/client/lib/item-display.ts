export function getDisplayItemName(marketHashName: string, wearName?: string | null): string {
  if (!wearName) {
    return marketHashName;
  }

  const suffix = ` (${wearName})`;
  if (marketHashName.endsWith(suffix)) {
    return marketHashName.slice(0, -suffix.length);
  }

  return marketHashName;
}
