import type { SQLiteDatabase } from 'expo-sqlite';
import { listExerciseSetHistory, listExercisesInWorkouts } from '../db/repo';
import type { LoadType, SetHistoryRow } from '../db/types';
import { formatLoad, formatWeight } from './format';

/*
 * Personal records, worked out from an exercise's set history (no stored state, so editing or
 * deleting sets, or back-filling past workouts, can never leave stale records).
 *
 * A set is a record when it beats every EARLIER set of the same exercise in the same unit
 * (kg and levels are never compared). "Earlier" = earlier workout, or earlier in the same workout.
 * Three kinds:
 *  - weight: heaviest weight (or highest level) ever
 *  - e1rm:   best estimated one-rep max (Epley), kg only
 *  - reps:   more reps than ever at this weight/level or heavier
 * To avoid noise, nothing counts as a record in the first workout an exercise was done in (per
 * unit), and a rep record needs an earlier set at that weight or heavier to compare against.
 */

export type PrKind = 'weight' | 'e1rm' | 'reps';

export interface PrHit {
  kind: PrKind;
  unit: LoadType;
  /** The new best (kg, level, est. 1RM kg, or reps). */
  value: number;
  /** The best it beat. */
  previous: number;
  /** For rep records: the weight/level the reps were done at. */
  at?: number;
}

/** Epley estimated one-rep max: weight × (1 + reps/30), or the weight itself for a single. */
export function e1rm(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

const EPS = 1e-9;

/** Record hits per set id, for every set in the history that was a record when it was done. */
export function findRecords(history: SetHistoryRow[]): Map<string, PrHit[]> {
  const out = new Map<string, PrHit[]>();
  const earlier: Record<LoadType, SetHistoryRow[]> = { weight: [], level: [] };
  const firstWorkout: Partial<Record<LoadType, string>> = {};

  for (const s of history) {
    const unit = s.load_type;
    const prior = earlier[unit];
    firstWorkout[unit] ??= s.workout_id;

    if (prior.length > 0 && s.workout_id !== firstWorkout[unit]) {
      const hits: PrHit[] = [];

      const maxWeight = Math.max(...prior.map((p) => p.weight));
      if (s.weight > maxWeight + EPS) hits.push({ kind: 'weight', unit, value: s.weight, previous: maxWeight });

      if (unit === 'weight') {
        const maxE = Math.max(...prior.map((p) => e1rm(p.weight, p.reps)));
        const mine = e1rm(s.weight, s.reps);
        if (mine > maxE + EPS) hits.push({ kind: 'e1rm', unit, value: mine, previous: maxE });
      }

      const heavierOrEqual = prior.filter((p) => p.weight >= s.weight - EPS);
      if (heavierOrEqual.length > 0) {
        const maxReps = Math.max(...heavierOrEqual.map((p) => p.reps));
        if (s.reps > maxReps) hits.push({ kind: 'reps', unit, value: s.reps, previous: maxReps, at: s.weight });
      }

      if (hits.length) out.set(s.id, hits);
    }
    prior.push(s);
  }
  return out;
}

/** The most notable hit, for one-line messages: heaviest beats est. 1RM beats reps. */
export function mainHit(hits: PrHit[]): PrHit {
  const order: PrKind[] = ['weight', 'e1rm', 'reps'];
  return [...hits].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
}

const round1 = (n: number) => formatWeight(Math.round(n * 10) / 10);

/** "Heaviest: 17.5 kg (was 16 kg)", "Best est. 1RM: 23.3 kg (was 21.9 kg)", "Most reps at 16 kg+: 9 (was 8)". */
export function describeHit(h: PrHit): string {
  switch (h.kind) {
    case 'weight':
      return h.unit === 'level'
        ? `Highest level: ${formatWeight(h.value)} (was ${formatWeight(h.previous)})`
        : `Heaviest: ${formatLoad(h.value, 'weight')} (was ${formatLoad(h.previous, 'weight')})`;
    case 'e1rm':
      return `Best est. 1RM: ${round1(h.value)} kg (was ${round1(h.previous)} kg)`;
    case 'reps':
      return `Most reps at ${formatLoad(h.at ?? 0, h.unit)}+: ${h.value} (was ${h.previous})`;
  }
}

// ───────────────────────── Records summary (Progress tab) ─────────────────────────

export const REP_COLUMNS = [1, 3, 5, 8, 10, 12];

export interface RecordEntry {
  value: number;
  reps: number;
  workoutId: string;
  startedAt: number;
}

export interface ExerciseRecords {
  heaviest: RecordEntry | null;
  /** kg exercises only. */
  bestE1rm: RecordEntry | null;
  /** Best weight/level lifted for at least N reps, for each N in REP_COLUMNS (null = never). */
  repMax: { reps: number; best: RecordEntry | null }[];
}

/** All-time bests for one unit of an exercise. Ties go to the first time it was achieved. */
export function summarizeRecords(history: SetHistoryRow[], unit: LoadType): ExerciseRecords {
  const sets = history.filter((s) => s.load_type === unit);
  const entry = (s: SetHistoryRow, value: number): RecordEntry => ({
    value,
    reps: s.reps,
    workoutId: s.workout_id,
    startedAt: s.started_at,
  });
  let heaviest: RecordEntry | null = null;
  let bestE1rm: RecordEntry | null = null;
  const repMax = REP_COLUMNS.map((reps) => ({ reps, best: null as RecordEntry | null }));

  for (const s of sets) {
    if (!heaviest || s.weight > heaviest.value + EPS) heaviest = entry(s, s.weight);
    if (unit === 'weight') {
      const e = e1rm(s.weight, s.reps);
      if (!bestE1rm || e > bestE1rm.value + EPS) bestE1rm = entry(s, e);
    }
    for (const col of repMax) {
      if (s.reps >= col.reps && (!col.best || s.weight > col.best.value + EPS)) col.best = entry(s, s.weight);
    }
  }
  return { heaviest, bestE1rm, repMax };
}

// ───────────────────────── Loading (uses repo functions, no SQL here) ─────────────────────────

/** Record hits for the sets in the given workouts, keyed by set id. */
export async function recordsForWorkouts(db: SQLiteDatabase, workoutIds: string[]): Promise<Map<string, PrHit[]>> {
  const wanted = new Set(workoutIds);
  const out = new Map<string, PrHit[]>();
  for (const exerciseId of await listExercisesInWorkouts(db, workoutIds)) {
    const history = await listExerciseSetHistory(db, exerciseId);
    const inWanted = new Set(history.filter((s) => wanted.has(s.workout_id)).map((s) => s.id));
    for (const [setId, hits] of findRecords(history)) if (inWanted.has(setId)) out.set(setId, hits);
  }
  return out;
}

/** Number of record-setting sets per workout (a set with several kinds of record counts once). */
export async function countRecordsByWorkout(db: SQLiteDatabase, workoutIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (workoutIds.length === 0) return counts;
  const wanted = new Set(workoutIds);
  for (const exerciseId of await listExercisesInWorkouts(db, workoutIds)) {
    const history = await listExerciseSetHistory(db, exerciseId);
    const records = findRecords(history);
    for (const s of history) {
      if (wanted.has(s.workout_id) && records.has(s.id)) counts.set(s.workout_id, (counts.get(s.workout_id) ?? 0) + 1);
    }
  }
  return counts;
}
