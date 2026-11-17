import type { OperationalAlert } from './finance';

export function toggleAlertSeenId(
  seenIds: string[],
  alertId: string,
): string[] {
  const cleanId = alertId.trim();
  if (!cleanId) return seenIds;
  const exists = seenIds.includes(cleanId);
  if (exists) {
    return seenIds.filter((id) => id !== cleanId);
  }
  return [...seenIds, cleanId];
}

export function markAllAlertsSeenIds(
  seenIds: string[],
  alerts: OperationalAlert[],
): string[] {
  const merged = new Set(seenIds);
  for (const alert of alerts) {
    merged.add(alert.id);
  }
  return Array.from(merged);
}

export function getUnseenAlertCount(
  alerts: OperationalAlert[],
  seenIds: string[],
): number {
  const seenSet = new Set(seenIds);
  let count = 0;
  for (const alert of alerts) {
    if (!seenSet.has(alert.id)) {
      count += 1;
    }
  }
  return count;
}

export function pruneSeenAlertIds(
  seenIds: string[],
  alerts: OperationalAlert[],
): string[] {
  if (seenIds.length === 0) return seenIds;
  const activeIds = new Set(alerts.map((a) => a.id));
  const filtered = seenIds.filter((id) => activeIds.has(id));
  return filtered.length === seenIds.length ? seenIds : filtered;
}
