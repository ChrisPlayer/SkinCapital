export function getDisplayItemName(marketHashName: string, wearName?: string | null): string {
  if (!wearName) {
    return marketHashName.replace(
      /\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred|FN|MW|FT|WW|BS)\)$/i,
      '',
    );
  }

  const suffix = ` (${wearName})`;
  if (marketHashName.endsWith(suffix)) {
    return marketHashName.slice(0, -suffix.length);
  }

  return marketHashName.replace(
    /\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred|FN|MW|FT|WW|BS)\)$/i,
    '',
  );
}
