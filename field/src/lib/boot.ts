/** Facts from app start, shown once on Home (e.g. "recovered 1 record the app was closed on"). */
export const bootInfo = { recoveredDrafts: 0, shown: false };

/** "Select your profile" comes first on every launch (the phone is shared and passed between people). */
export const launch = { profileChosen: false };

/** "today", "1 day ago", "6 days ago". */
export function daysAgo(iso: string | null): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return 'unknown';
  if (days <= 0) return 'today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
