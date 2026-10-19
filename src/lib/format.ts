/** "Fri 26 Jun", with the year added when it isn't this year ("Thu 26 Jun 2025"). */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** "26 Jun" or "26 Jun 2025": compact, for list rows. */
export function formatDayMonth(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** "June 2026": month headings in long lists. */
export function formatMonthYear(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(fromMs: number, toMs: number): string {
  const mins = Math.max(0, Math.round((toMs - fromMs) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** 82.5 → "82.5", 80 → "80" */
export function formatWeight(w: number): string {
  return String(Math.round(w * 100) / 100);
}

import type { LoadType } from '../db/types';

/** "80 kg", "level 7", "BW" (bodyweight only) or "BW +10 kg" (with added weight) */
export function formatLoad(v: number, t: LoadType): string {
  if (t === 'bodyweight') return v > 0 ? `BW +${formatWeight(v)} kg` : 'BW';
  return t === 'level' ? `level ${formatWeight(v)}` : `${formatWeight(v)} kg`;
}

/** Short unit names for headers and labels. */
export const UNIT_LABEL: Record<LoadType, string> = { weight: 'kg', level: 'level', bodyweight: 'bodyweight' };


export function formatVolume(v: number): string {
  if (v >= 10000) return `${(v / 1000).toFixed(1)}t`;
  return `${Math.round(v)} kg`;
}

/** Parses user input like "82,5" or "82.5"; returns null for invalid. */
export function parseNumber(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago", "2 years ago" (by calendar day). */
export function formatAgo(ms: number, now = Date.now()): string {
  const day = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const days = Math.round(day(now) - day(ms));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (days < 14) return plural(days, 'day');
  if (days < 60) return plural(Math.round(days / 7), 'week');
  if (days < 365) return plural(Math.round(days / 30), 'month');
  return plural(Math.round(days / 365), 'year');
}

/**
 * One-line summary of a past session for an exercise:
 * "26 Jun · 3 sets · best 16 kg × 6 reps", or "4 Jun · 1 set · level 3 × 6 reps".
 * "Best" is the heaviest set (most reps on a tie), preferring sets in `unit` if there are any.
 */
export function formatSessionSummary(
  startedAt: number,
  sets: { weight: number; reps: number; load_type: LoadType }[],
  unit: LoadType,
): string {
  const pool = sets.some((s) => s.load_type === unit) ? sets.filter((s) => s.load_type === unit) : sets;
  const best = pool.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a), pool[0]);
  const count = `${sets.length} set${sets.length === 1 ? '' : 's'}`;
  const top = best ? `${sets.length > 1 ? 'best ' : ''}${formatLoad(best.weight, best.load_type)} × ${best.reps} rep${best.reps === 1 ? '' : 's'}` : '';
  return [formatDayMonth(startedAt), count, top].filter(Boolean).join(' · ');
}

/** First line of a note for list previews ("📝 Felt strong, left…"), or null if there's no note. */
export function notePreview(notes: string | null | undefined, max = 60): string | null {
  const text = notes?.trim();
  if (!text) return null;
  const [first, ...rest] = text.split('\n');
  const line = first.trim();
  const cut = line.length > max;
  return `📝 ${cut ? line.slice(0, max - 1).trimEnd() : line}${cut || rest.length ? '…' : ''}`;
}

/** "1 week", "6 weeks" */
export function formatWeeks(n: number): string {
  return `${n} week${n === 1 ? '' : 's'}`;
}
