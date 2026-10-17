import { addWeeks, startOfWeek } from './consistency';

/*
 * Workout trends (pure): four metrics bucketed by week (Mon–Sun) or calendar month, local time.
 *
 *  - volume:          kg × reps of kg sets (machine levels aren't weight)
 *  - totalSets:       every set, kg and levels
 *  - setsPerWorkout:  average sets per workout in the period
 *  - duration:        average minutes, ONLY from live-tracked workouts. Imported and back-filled
 *                     workouts have made-up times (imports are all 60 min). A live workout is
 *                     created the moment it starts, so created_at ≈ started_at; others are created later.
 *
 * Sums (volume, total sets) treat a period with no workouts as 0; averages treat it as "no data".
 */

export type TrendMetric = 'volume' | 'totalSets' | 'setsPerWorkout' | 'duration';
export type TrendBucket = 'week' | 'month';

export interface TrendWorkout {
  id: string;
  started_at: number;
  ended_at: number;
  created_at: number;
  set_count: number;
  volume: number;
}

export interface TrendPoint {
  /** Start of the period (local midnight). */
  start: number;
  /** Value for the metric, or null when there's no data (averages with no qualifying workouts). */
  value: number | null;
  /** The current, unfinished period. */
  inProgress: boolean;
}

export const TREND_PERIODS = 12;
const LIVE_TOLERANCE_MS = 60_000;

export function isLiveTracked(w: TrendWorkout): boolean {
  return Math.abs(w.created_at - w.started_at) < LIVE_TOLERANCE_MS && w.ended_at > w.started_at;
}

function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function addMonths(monthStart: number, n: number): number {
  const d = new Date(monthStart);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}

function periodStarts(bucket: TrendBucket, now: number, count: number): number[] {
  const current = bucket === 'week' ? startOfWeek(now) : startOfMonth(now);
  const step = bucket === 'week' ? addWeeks : addMonths;
  return Array.from({ length: count }, (_, i) => step(current, i - (count - 1)));
}

function valueFor(metric: TrendMetric, ws: TrendWorkout[]): number | null {
  switch (metric) {
    case 'volume':
      return ws.reduce((a, w) => a + w.volume, 0);
    case 'totalSets':
      return ws.reduce((a, w) => a + w.set_count, 0);
    case 'setsPerWorkout':
      return ws.length ? ws.reduce((a, w) => a + w.set_count, 0) / ws.length : null;
    case 'duration': {
      const live = ws.filter(isLiveTracked);
      return live.length ? live.reduce((a, w) => a + (w.ended_at - w.started_at), 0) / live.length / 60_000 : null;
    }
  }
}

/** The last `count` periods (oldest first), the last one being the current, in-progress period. */
export function trendSeries(
  log: TrendWorkout[],
  metric: TrendMetric,
  bucket: TrendBucket,
  now: number,
  count = TREND_PERIODS,
): TrendPoint[] {
  const starts = periodStarts(bucket, now, count);
  const nextStart = bucket === 'week' ? addWeeks(starts[count - 1], 1) : addMonths(starts[count - 1], 1);
  return starts.map((start, i) => {
    const end = i + 1 < count ? starts[i + 1] : nextStart;
    const ws = log.filter((w) => w.started_at >= start && w.started_at < end && w.started_at <= now);
    return { start, value: valueFor(metric, ws), inProgress: i === count - 1 };
  });
}

export interface TrendHeadline {
  /** The last complete period. */
  point: TrendPoint;
  /** Average of up to 4 complete periods before it (ignoring "no data"), or null. */
  baseline: number | null;
  /** Percent change vs baseline, or null when there's nothing to compare with. */
  changePct: number | null;
}

/** Last complete period vs the average of the 4 before it. Needs at least 2 points. */
export function trendHeadline(series: TrendPoint[]): TrendHeadline | null {
  const complete = series.filter((p) => !p.inProgress);
  const point = complete[complete.length - 1];
  if (!point) return null;
  const prior = complete
    .slice(-5, -1)
    .map((p) => p.value)
    .filter((v): v is number => v != null);
  const baseline = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null;
  const changePct = point.value != null && baseline != null && baseline > 0 ? ((point.value - baseline) / baseline) * 100 : null;
  return { point, baseline, changePct };
}
