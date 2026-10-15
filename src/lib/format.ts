export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
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

/** "80 kg" or "level 7" */
export function formatLoad(v: number, t: LoadType): string {
  return t === 'level' ? `level ${formatWeight(v)}` : `${formatWeight(v)} kg`;
}

/** Compact set notation: "80×8" or "L7×12" */
export function formatSetShort(v: number, reps: number, t: LoadType): string {
  return `${t === 'level' ? 'L' : ''}${formatWeight(v)}×${reps}`;
}

export function formatVolume(v: number): string {
  if (v >= 10000) return `${(v / 1000).toFixed(1)}t`;
  return `${Math.round(v)} kg`;
}

/** Parses user input like "82,5" or "82.5"; returns null for invalid. */
export function parseNumber(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
}
