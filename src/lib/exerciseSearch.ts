import type { Exercise } from '../db/types';

/*
 * Search and muscle-group filtering shared by the Progress tab's exercise dropdown and the
 * exercise picker (routines, workouts), so both behave the same.
 */

/** Filter chip groups: the muscle groups these exercises have, most common first, then by name. */
export function muscleGroupFilters(exercises: Exercise[], groupsByExercise: Map<string, string[]>): string[] {
  const count = new Map<string, number>();
  for (const e of exercises) for (const g of groupsByExercise.get(e.id) ?? []) count.set(g, (count.get(g) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
}

/**
 * Exercises in the chosen group (null = all) that match the query. Name matches come first, then
 * ones that only match by muscle group; each part keeps the input order (e.g. most recent first).
 */
export function searchExercises<T extends Exercise>(
  exercises: T[],
  groupsByExercise: Map<string, string[]>,
  query: string,
  group: string | null,
): T[] {
  const q = query.trim().toLowerCase();
  const inGroup = exercises.filter((e) => !group || (groupsByExercise.get(e.id) ?? []).includes(group));
  if (q === '') return inGroup;
  return [
    ...inGroup.filter((e) => e.name.toLowerCase().includes(q)),
    ...inGroup.filter((e) => !e.name.toLowerCase().includes(q) && (e.muscle_groups ?? '').toLowerCase().includes(q)),
  ];
}

/** Muscle group names per exercise id, from listExerciseMuscleGroupLinks rows. */
export function groupsByExerciseId(links: { exercise_id: string; name: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const l of links) out.set(l.exercise_id, [...(out.get(l.exercise_id) ?? []), l.name]);
  return out;
}
