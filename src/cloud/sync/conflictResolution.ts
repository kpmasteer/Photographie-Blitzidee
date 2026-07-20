export type TimestampWinner = "local" | "cloud" | "conflict";

/**
 * Chooses a side only when both timestamps are valid instants. Equal instants
 * prefer the cloud so a duplicate local queue entry cannot overwrite it.
 */
export function timestampWinner(localTimestamp?: string, cloudTimestamp?: string): TimestampWinner {
  if (!localTimestamp || !cloudTimestamp) return "conflict";
  const localTime = Date.parse(localTimestamp);
  const cloudTime = Date.parse(cloudTimestamp);
  if (!Number.isFinite(localTime) || !Number.isFinite(cloudTime)) return "conflict";
  return localTime > cloudTime ? "local" : "cloud";
}
