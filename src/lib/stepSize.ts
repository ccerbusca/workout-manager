import type { LoadType } from '../db/types';

/** Stepper increment when there's nothing to learn from yet. */
export const DEFAULT_STEP: Record<LoadType, number> = { weight: 2.5, level: 1, bodyweight: 2.5 };

/** Gaps outside this range are ignored: smaller ones are typos or rounding, bigger ones are jumps, not a machine's step. */
const MIN_GAP = 0.25;
const MAX_GAP = 7.5; // the biggest real step seen: 7 kg cable stacks

/**
 * The weight stepper's increment for an exercise, learnt from weights you actually used (today's
 * sets and last session's, in the current unit): the smallest gap between two different weights.
 * Machines and stacks step differently (2, 2.5, 3 kg…), so a fixed 2.5 would land on weights the
 * machine doesn't have. With fewer than two different weights, it falls back to DEFAULT_STEP.
 *
 * Returns the step and whether it was learnt (false = the default).
 */
export function inferStep(weights: number[], unit: LoadType): { step: number; learnt: boolean } {
  // Round to 2 decimals first so float noise (17.499999…) doesn't create fake gaps
  const distinct = [...new Set(weights.map((w) => Math.round(w * 100) / 100))].sort((a, b) => a - b);
  let best: number | null = null;
  for (let i = 1; i < distinct.length; i++) {
    const gap = Math.round((distinct[i] - distinct[i - 1]) * 100) / 100;
    if (gap >= MIN_GAP && gap <= MAX_GAP && (best == null || gap < best)) best = gap;
  }
  return best == null ? { step: DEFAULT_STEP[unit], learnt: false } : { step: best, learnt: true };
}

/**
 * inferStep over an exercise's history (any order), going back session by session from the newest
 * until a step can be learnt, up to `maxSessions`. Two sessions usually show a gap; when they
 * don't (one weight each time, or a jump of two steps), older sessions fill in, e.g. a 45/52/59 kg
 * cable stack still yields 7. Older than that is left out: the gym or machine may have changed.
 */
export function inferStepFromHistory(
  history: { workout_id: string; started_at: number; weight: number; load_type: LoadType }[],
  unit: LoadType,
  maxSessions = 6,
): { step: number; learnt: boolean } {
  const sessions = new Map<string, { at: number; weights: number[] }>();
  for (const s of history) {
    if (s.load_type !== unit) continue;
    const sess = sessions.get(s.workout_id) ?? { at: s.started_at, weights: [] };
    sess.weights.push(s.weight);
    sessions.set(s.workout_id, sess);
  }
  const newestFirst = [...sessions.values()].sort((a, b) => b.at - a.at).slice(0, maxSessions);
  const weights: number[] = [];
  for (let i = 0; i < newestFirst.length; i++) {
    weights.push(...newestFirst[i].weights);
    if (i === 0 && newestFirst.length > 1) continue; // always look at two sessions when there are two
    const r = inferStep(weights, unit);
    if (r.learnt) return r;
  }
  return inferStep(weights, unit);
}
