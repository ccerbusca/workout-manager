import { startOfLocalDay } from './consistency';

/*
 * Muscle-group balance (pure): sets per group over a recent window, and days since each group was
 * last trained. A set counts fully for every group of its exercise (the user's choice: the usual
 * "sets per muscle" convention), so compound lifts also add to their helper muscles.
 */

export interface GroupSetEntry {
  group_id: string;
  name: string;
  started_at: number;
  sets: number;
}

export interface BalanceRow {
  groupId: string;
  name: string;
  /** Sets in the window. */
  sets: number;
  /** Calendar days since this group was last trained (0 = today), or null if never. */
  daysSince: number | null;
  /** Not trained for STALE_DAYS or more, or never. */
  stale: boolean;
}

export const STALE_DAYS = 10;
export const BALANCE_WINDOWS = [7, 30] as const;

/** Whole calendar days from `from` to `to` (local time, DST-safe). */
function calendarDaysBetween(from: number, to: number): number {
  const a = new Date(startOfLocalDay(from));
  const b = new Date(startOfLocalDay(to));
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

/**
 * One row per group in `groups` (the groups current exercises use; others, e.g. only linked to
 * deleted exercises, are left out as noise), for the last `windowDays` calendar days including today. Sorted by sets in the window (most
 * first), then most recently trained; never-trained groups go last.
 */
export function muscleBalance(
  log: GroupSetEntry[],
  groups: { id: string; name: string }[],
  windowDays: number,
  now: number,
): BalanceRow[] {
  // Window = today plus the previous windowDays - 1 calendar days
  const t = new Date(startOfLocalDay(now));
  const windowStart = new Date(t.getFullYear(), t.getMonth(), t.getDate() - (windowDays - 1)).getTime();

  const rows = new Map<string, { name: string; sets: number; lastAt: number | null }>();
  for (const g of groups) rows.set(g.id, { name: g.name, sets: 0, lastAt: null });
  for (const e of log) {
    const r = rows.get(e.group_id);
    if (!r) continue;
    if (e.started_at >= windowStart && e.started_at <= now) r.sets += e.sets;
    if (e.started_at <= now && (r.lastAt == null || e.started_at > r.lastAt)) r.lastAt = e.started_at;
  }

  return [...rows.entries()]
    .map(([groupId, r]) => {
      const daysSince = r.lastAt == null ? null : calendarDaysBetween(r.lastAt, now);
      return { groupId, name: r.name, sets: r.sets, daysSince, stale: daysSince == null || daysSince >= STALE_DAYS };
    })
    .sort(
      (a, b) =>
        b.sets - a.sets ||
        (a.daysSince ?? Infinity) - (b.daysSince ?? Infinity) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
}

/** "today", "yesterday", "5 days ago", or "never". */
export function formatDaysSince(days: number | null): string {
  if (days == null) return 'never';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
