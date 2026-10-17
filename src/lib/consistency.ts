/*
 * Training consistency, computed from the list of finished workouts (pure; no DB access).
 *
 * Weeks run Monday–Sunday in local time. A week "meets the goal" when it has at least `goal`
 * workouts. The streak counts consecutive goal weeks; the current week only adds to it once it
 * meets the goal, and never breaks it while it's still in progress.
 */

export interface LoggedWorkout {
  id: string;
  started_at: number;
  set_count: number;
}

export interface TrainingDay {
  /** Local midnight of the day. */
  day: number;
  workoutIds: string[];
  sets: number;
}

/** Local midnight. */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local midnight of the Monday starting the week that contains `ms`. */
export function startOfWeek(ms: number): number {
  const d = new Date(startOfLocalDay(ms));
  const back = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
}

/** The Monday `n` weeks later (or earlier, if negative). Calendar arithmetic, so DST can't drift it. */
export function addWeeks(weekStart: number, n: number): number {
  const d = new Date(weekStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n).getTime();
}

export const nextWeek = (weekStart: number) => addWeeks(weekStart, 1);

/** Workouts grouped by local day. */
export function trainingDays(log: LoggedWorkout[]): Map<number, TrainingDay> {
  const days = new Map<number, TrainingDay>();
  for (const w of log) {
    const day = startOfLocalDay(w.started_at);
    const d = days.get(day) ?? { day, workoutIds: [], sets: 0 };
    d.workoutIds.push(w.id);
    d.sets += w.set_count;
    days.set(day, d);
  }
  return days;
}

/** Workout count per week (key: Monday local midnight), for every week from the first workout to `now`. */
export function weeklyCounts(log: LoggedWorkout[], now: number): { week: number; count: number }[] {
  if (log.length === 0) return [];
  const counts = new Map<number, number>();
  for (const w of log) {
    const k = startOfWeek(w.started_at);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const first = startOfWeek(Math.min(...log.map((w) => w.started_at)));
  const last = startOfWeek(Math.max(now, ...log.map((w) => w.started_at)));
  const out: { week: number; count: number }[] = [];
  for (let wk = first; wk <= last; wk = nextWeek(wk)) out.push({ week: wk, count: counts.get(wk) ?? 0 });
  return out;
}

export interface Streaks {
  /** Goal weeks in a row up to now (the current week counts once it meets the goal). */
  current: number;
  best: number;
  /** Workouts so far this week. */
  thisWeek: number;
}

export function computeStreaks(weeks: { week: number; count: number }[], goal: number, now: number): Streaks {
  const thisWeekStart = startOfWeek(now);
  let run = 0;
  let best = 0;
  let current = 0;
  for (const w of weeks) {
    const isCurrent = w.week === thisWeekStart;
    if (w.count >= goal) {
      run++;
      best = Math.max(best, run);
    } else if (!isCurrent) {
      run = 0;
    }
    current = run;
  }
  const thisWeek = weeks.find((w) => w.week === thisWeekStart)?.count ?? 0;
  return { current, best, thisWeek };
}

export interface YearSummary {
  year: number;
  workouts: number;
  /** Weeks (starting in this year) that met the goal. */
  goalWeeks: number;
  /** Longest run of goal weeks starting in this year. */
  bestStreak: number;
}

export function summarizeYear(log: LoggedWorkout[], weeks: { week: number; count: number }[], goal: number, year: number): YearSummary {
  const inYear = weeks.filter((w) => new Date(w.week).getFullYear() === year);
  let run = 0;
  let bestStreak = 0;
  for (const w of inYear) {
    run = w.count >= goal ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }
  return {
    year,
    workouts: log.filter((w) => new Date(w.started_at).getFullYear() === year).length,
    goalWeeks: inYear.filter((w) => w.count >= goal).length,
    bestStreak,
  };
}

/** Years that have workouts, newest first. */
export function yearsWithTraining(log: LoggedWorkout[]): number[] {
  return [...new Set(log.map((w) => new Date(w.started_at).getFullYear()))].sort((a, b) => b - a);
}

/**
 * Colour level 0–4 for a day's set count, relative to your own history: 0 = rest day, then 1–4
 * by quartile of all training days' set counts. So a typical day lands mid-scale whatever your
 * usual volume (the imported sheet has far fewer sets per day than logging in the app).
 */
export function intensityScale(days: Map<number, TrainingDay>): (sets: number | undefined) => 0 | 1 | 2 | 3 | 4 {
  const sorted = [...days.values()].map((d) => d.sets).sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.floor(f * (sorted.length - 1))] ?? 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return (sets) => {
    if (sets == null) return 0;
    if (sets <= q1) return 1;
    if (sets <= q2) return 2;
    if (sets <= q3) return 3;
    return 4;
  };
}

/** The 7 local midnights of the week starting at `weekStart`. */
export function daysOfWeek(weekStart: number): number[] {
  const d = new Date(weekStart);
  return Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i).getTime());
}

