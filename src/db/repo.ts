import type { SQLiteDatabase } from 'expo-sqlite';
import { newId, now } from '../lib/id';
import { fromLocalIso, toLocalIso } from '../lib/backup';
import type {
  BackupExercise,
  BackupFile,
  BackupWorkout,
  Exercise,
  ImportResult,
  TrainedExercise,
  LoadType,
  MuscleGroup,
  ExerciseSessionStats,
  Routine,
  RoutineExercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutSummary,
} from './types';

/*
 * All database access lives here. Screens never write SQL directly,
 * which keeps one place to change when a server sync layer is added.
 */

// ───────────────────────── Seed ─────────────────────────

// Keep in sync with migration v6, which regroups these on databases seeded before v5
const DEFAULT_EXERCISES: [string, string[]][] = [
  ['Bench Press', ['Chest', 'Shoulders', 'Triceps']],
  ['Incline Dumbbell Press', ['Chest', 'Shoulders', 'Triceps']],
  ['Overhead Press', ['Shoulders', 'Triceps']],
  ['Lateral Raise', ['Shoulders']],
  ['Squat', ['Quads', 'Glutes']],
  ['Romanian Deadlift', ['Hamstrings', 'Glutes', 'Lower back']],
  ['Leg Press', ['Quads', 'Glutes']],
  ['Deadlift', ['Hamstrings', 'Glutes', 'Lower back', 'Upper back']],
  ['Pull-up', ['Lats', 'Biceps']],
  ['Barbell Row', ['Upper back', 'Lats', 'Biceps']],
  ['Lat Pulldown', ['Lats', 'Biceps']],
  ['Biceps Curl', ['Biceps']],
  ['Triceps Pushdown', ['Triceps']],
];

export async function seedIfEmpty(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM exercises');
  if ((row?.n ?? 0) > 0) return;
  const t = now();
  await db.withTransactionAsync(async () => {
    for (const [name, groups] of DEFAULT_EXERCISES) {
      const groupIds: string[] = [];
      for (const g of groups) groupIds.push(await findOrInsertMuscleGroup(db, g, t));
      await insertExercise(db, name, groupIds, t);
    }
  });
}

// ───────────────────────── Muscle groups ─────────────────────────

/** The shared list offered in the muscle-group dropdown. */
export function listMuscleGroups(db: SQLiteDatabase): Promise<MuscleGroup[]> {
  return db.getAllAsync<MuscleGroup>(
    `SELECT id, name FROM muscle_groups WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
  );
}

/** Adds a group to the shared list, or returns the existing one with the same name (any case). */
export async function createMuscleGroup(db: SQLiteDatabase, name: string): Promise<MuscleGroup> {
  const id = await findOrInsertMuscleGroup(db, name, now());
  return { id, name: (await db.getFirstAsync<{ name: string }>('SELECT name FROM muscle_groups WHERE id = ?', id))!.name };
}

async function findOrInsertMuscleGroup(db: SQLiteDatabase, name: string, t: number): Promise<string> {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM muscle_groups WHERE lower(name) = lower(?) AND deleted_at IS NULL',
    name.trim(),
  );
  if (existing) return existing.id;
  const id = newId();
  await db.runAsync(
    'INSERT INTO muscle_groups (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    id, name.trim(), t, t,
  );
  return id;
}

/** Every (exercise, group) link, for grouping the Exercises tab. */
export function listExerciseMuscleGroupLinks(
  db: SQLiteDatabase,
): Promise<{ exercise_id: string; muscle_group_id: string; name: string }[]> {
  return db.getAllAsync(
    `SELECT emg.exercise_id, mg.id AS muscle_group_id, mg.name
     FROM exercise_muscle_groups emg
     JOIN muscle_groups mg ON mg.id = emg.muscle_group_id AND mg.deleted_at IS NULL
     WHERE emg.deleted_at IS NULL`,
  );
}

/**
 * SQL expression for an exercise's groups as one display label ("Chest, Shoulders"), or NULL.
 * Needs the exercises table aliased as `e`.
 */
const MUSCLE_GROUPS_LABEL = `(
  SELECT group_concat(name, ', ') FROM (
    SELECT mg.name FROM exercise_muscle_groups emg
    JOIN muscle_groups mg ON mg.id = emg.muscle_group_id AND mg.deleted_at IS NULL
    WHERE emg.exercise_id = e.id AND emg.deleted_at IS NULL
    ORDER BY mg.name COLLATE NOCASE
  )
)`;

// ───────────────────────── Exercises ─────────────────────────

export function listExercises(db: SQLiteDatabase): Promise<Exercise[]> {
  return db.getAllAsync<Exercise>(
    `SELECT e.id, e.name, ${MUSCLE_GROUPS_LABEL} AS muscle_groups, e.load_type FROM exercises e
     WHERE e.deleted_at IS NULL
     ORDER BY e.name COLLATE NOCASE`,
  );
}

export async function createExercise(db: SQLiteDatabase, name: string, muscleGroupIds: string[]): Promise<string> {
  let id = '';
  await db.withTransactionAsync(async () => {
    id = await insertExercise(db, name, muscleGroupIds, now());
  });
  return id;
}

async function insertExercise(db: SQLiteDatabase, name: string, muscleGroupIds: string[], t: number): Promise<string> {
  // New exercises start in kg; switch to levels with a long-press in a workout (setExerciseLoadType).
  // muscle_group (the pre-v5 text column) is left NULL; groups live in exercise_muscle_groups.
  const id = newId();
  await db.runAsync(
    `INSERT INTO exercises (id, name, load_type, created_at, updated_at) VALUES (?, ?, 'weight', ?, ?)`,
    id, name.trim(), t, t,
  );
  for (const groupId of new Set(muscleGroupIds)) {
    await db.runAsync(
      'INSERT INTO exercise_muscle_groups (id, exercise_id, muscle_group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      newId(), id, groupId, t, t,
    );
  }
  return id;
}

export async function getExerciseName(db: SQLiteDatabase, id: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM exercises WHERE id = ?', id);
  return row?.name ?? null;
}

/** IDs of the groups an exercise currently belongs to (for the edit form). */
export async function getExerciseMuscleGroupIds(db: SQLiteDatabase, exerciseId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ muscle_group_id: string }>(
    'SELECT muscle_group_id FROM exercise_muscle_groups WHERE exercise_id = ? AND deleted_at IS NULL',
    exerciseId,
  );
  return rows.map((r) => r.muscle_group_id);
}

export async function updateExercise(
  db: SQLiteDatabase,
  id: string,
  name: string,
  muscleGroupIds: string[],
): Promise<void> {
  // The unit (kg/level) is switched mid-workout with a long-press instead (setExerciseLoadType)
  const t = now();
  const wanted = new Set(muscleGroupIds);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE exercises SET name = ?, updated_at = ? WHERE id = ?', name.trim(), t, id);
    const links = await db.getAllAsync<{ id: string; muscle_group_id: string }>(
      'SELECT id, muscle_group_id FROM exercise_muscle_groups WHERE exercise_id = ? AND deleted_at IS NULL',
      id,
    );
    // Soft-delete links that were unticked, add the newly ticked ones, leave the rest untouched
    for (const l of links) {
      if (wanted.has(l.muscle_group_id)) wanted.delete(l.muscle_group_id);
      else await db.runAsync('UPDATE exercise_muscle_groups SET deleted_at = ?, updated_at = ? WHERE id = ?', t, t, l.id);
    }
    for (const groupId of wanted) {
      await db.runAsync(
        'INSERT INTO exercise_muscle_groups (id, exercise_id, muscle_group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        newId(), id, groupId, t, t,
      );
    }
  });
}

/** Switch the unit new sets are logged in (kg or level). Existing sets keep their own unit. */
export async function setExerciseLoadType(db: SQLiteDatabase, id: string, loadType: LoadType): Promise<void> {
  await db.runAsync('UPDATE exercises SET load_type = ?, updated_at = ? WHERE id = ?', loadType, now(), id);
}

/** Soft delete: logged history keeps pointing at the exercise. */
export async function deleteExercise(db: SQLiteDatabase, id: string): Promise<void> {
  const t = now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE exercises SET deleted_at = ?, updated_at = ? WHERE id = ?', t, t, id);
    await db.runAsync(
      'UPDATE routine_exercises SET deleted_at = ?, updated_at = ? WHERE exercise_id = ? AND deleted_at IS NULL',
      t, t, id,
    );
  });
}

// ───────────────────────── Routines ─────────────────────────

export function listRoutines(db: SQLiteDatabase): Promise<Routine[]> {
  return db.getAllAsync<Routine>(
    `SELECT r.id, r.name,
            (SELECT COUNT(*) FROM routine_exercises re
             WHERE re.routine_id = r.id AND re.deleted_at IS NULL) AS exercise_count
     FROM routines r
     WHERE r.deleted_at IS NULL
     ORDER BY r.name COLLATE NOCASE`,
  );
}

export function getRoutine(db: SQLiteDatabase, id: string): Promise<{ id: string; name: string } | null> {
  return db.getFirstAsync('SELECT id, name FROM routines WHERE id = ?', id);
}

export async function createRoutine(db: SQLiteDatabase, name: string): Promise<string> {
  const id = newId();
  const t = now();
  await db.runAsync(
    'INSERT INTO routines (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    id, name.trim(), t, t,
  );
  return id;
}

export async function renameRoutine(db: SQLiteDatabase, id: string, name: string): Promise<void> {
  await db.runAsync('UPDATE routines SET name = ?, updated_at = ? WHERE id = ?', name.trim(), now(), id);
}

export async function deleteRoutine(db: SQLiteDatabase, id: string): Promise<void> {
  const t = now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE routines SET deleted_at = ?, updated_at = ? WHERE id = ?', t, t, id);
    await db.runAsync(
      'UPDATE routine_exercises SET deleted_at = ?, updated_at = ? WHERE routine_id = ? AND deleted_at IS NULL',
      t, t, id,
    );
  });
}

export function listRoutineExercises(db: SQLiteDatabase, routineId: string): Promise<RoutineExercise[]> {
  return db.getAllAsync<RoutineExercise>(
    `SELECT re.id, re.exercise_id, e.name, ${MUSCLE_GROUPS_LABEL} AS muscle_groups, e.load_type, re.position
     FROM routine_exercises re
     JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ? AND re.deleted_at IS NULL
     ORDER BY re.position`,
    routineId,
  );
}

export async function addExerciseToRoutine(
  db: SQLiteDatabase,
  routineId: string,
  exerciseId: string,
): Promise<void> {
  const row = await db.getFirstAsync<{ p: number | null }>(
    'SELECT MAX(position) AS p FROM routine_exercises WHERE routine_id = ? AND deleted_at IS NULL',
    routineId,
  );
  const t = now();
  await db.runAsync(
    `INSERT INTO routine_exercises (id, routine_id, exercise_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    newId(), routineId, exerciseId, (row?.p ?? -1) + 1, t, t,
  );
  await db.runAsync('UPDATE routines SET updated_at = ? WHERE id = ?', t, routineId);
}

export async function removeRoutineExercise(db: SQLiteDatabase, routineExerciseId: string): Promise<void> {
  const t = now();
  await db.runAsync(
    'UPDATE routine_exercises SET deleted_at = ?, updated_at = ? WHERE id = ?',
    t, t, routineExerciseId,
  );
}

/** Persist a new order: `orderedIds` are routine_exercises ids in display order. */
export async function reorderRoutineExercises(db: SQLiteDatabase, orderedIds: string[]): Promise<void> {
  const t = now();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync(
        'UPDATE routine_exercises SET position = ?, updated_at = ? WHERE id = ?',
        i, t, orderedIds[i],
      );
    }
  });
}

// ───────────────────────── Workouts ─────────────────────────

export function getActiveWorkout(db: SQLiteDatabase): Promise<Workout | null> {
  return db.getFirstAsync<Workout>(
    `SELECT id, routine_id, routine_name, started_at, ended_at, notes FROM workouts
     WHERE ended_at IS NULL AND deleted_at IS NULL
     ORDER BY started_at DESC LIMIT 1`,
  );
}

export function getWorkout(db: SQLiteDatabase, id: string): Promise<Workout | null> {
  return db.getFirstAsync<Workout>(
    'SELECT id, routine_id, routine_name, started_at, ended_at, notes FROM workouts WHERE id = ?',
    id,
  );
}

/**
 * Starts a workout, copying the routine's exercises into the workout.
 * Pass `past` to log a workout that already happened: it is created finished, with those times,
 * so it never counts as the workout in progress.
 */
export async function startWorkout(
  db: SQLiteDatabase,
  routineId: string | null,
  past?: { startedAt: number; endedAt: number },
): Promise<string> {
  const id = newId();
  const t = now();
  await db.withTransactionAsync(async () => {
    let routineName: string | null = null;
    if (routineId) {
      const r = await getRoutine(db, routineId);
      routineName = r?.name ?? null;
    }
    await db.runAsync(
      `INSERT INTO workouts (id, routine_id, routine_name, started_at, ended_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, routineId, routineName, past?.startedAt ?? t, past?.endedAt ?? null, t, t,
    );
    if (routineId) {
      const exercises = await listRoutineExercises(db, routineId);
      for (let i = 0; i < exercises.length; i++) {
        await db.runAsync(
          `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          newId(), id, exercises[i].exercise_id, i, t, t,
        );
      }
    }
  });
  return id;
}

export async function finishWorkout(db: SQLiteDatabase, id: string): Promise<void> {
  const t = now();
  await db.runAsync('UPDATE workouts SET ended_at = ?, updated_at = ? WHERE id = ?', t, t, id);
}

export async function deleteWorkout(db: SQLiteDatabase, id: string): Promise<void> {
  const t = now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE workouts SET deleted_at = ?, updated_at = ? WHERE id = ?', t, t, id);
    await db.runAsync(
      'UPDATE workout_sets SET deleted_at = ?, updated_at = ? WHERE workout_id = ? AND deleted_at IS NULL',
      t, t, id,
    );
    await db.runAsync(
      'UPDATE workout_exercises SET deleted_at = ?, updated_at = ? WHERE workout_id = ? AND deleted_at IS NULL',
      t, t, id,
    );
  });
}

/** Finished workouts, newest first. Omit `limit` for all of them. */
export function listWorkoutHistory(db: SQLiteDatabase, limit?: number): Promise<WorkoutSummary[]> {
  return db.getAllAsync<WorkoutSummary>(
    `SELECT w.id, w.routine_id, w.routine_name, w.started_at, w.ended_at, w.notes,
            COUNT(s.id)                      AS set_count,
            COUNT(DISTINCT s.exercise_id)    AS exercise_count,
            COALESCE(SUM(CASE WHEN s.load_type = 'weight' THEN s.weight * s.reps ELSE 0 END), 0) AS volume
     FROM workouts w
     LEFT JOIN workout_sets s ON s.workout_id = w.id AND s.deleted_at IS NULL
     WHERE w.deleted_at IS NULL AND w.ended_at IS NOT NULL
     GROUP BY w.id
     ORDER BY w.started_at DESC
     LIMIT ?`,
    limit ?? -1, // SQLite: a negative LIMIT means no limit
  );
}

export async function countWorkoutHistory(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM workouts WHERE deleted_at IS NULL AND ended_at IS NOT NULL',
  );
  return row?.n ?? 0;
}

export function listWorkoutExercises(db: SQLiteDatabase, workoutId: string): Promise<WorkoutExercise[]> {
  return db.getAllAsync<WorkoutExercise>(
    `SELECT we.id, we.exercise_id, e.name, e.load_type, we.position,
            (SELECT COUNT(*) FROM workout_sets s
             WHERE s.workout_id = we.workout_id AND s.exercise_id = we.exercise_id
               AND s.deleted_at IS NULL) AS set_count
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     WHERE we.workout_id = ? AND we.deleted_at IS NULL
     ORDER BY we.position`,
    workoutId,
  );
}

export async function addExerciseToWorkout(
  db: SQLiteDatabase,
  workoutId: string,
  exerciseId: string,
): Promise<void> {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM workout_exercises WHERE workout_id = ? AND exercise_id = ? AND deleted_at IS NULL',
    workoutId, exerciseId,
  );
  if (existing) return;
  const row = await db.getFirstAsync<{ p: number | null }>(
    'SELECT MAX(position) AS p FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL',
    workoutId,
  );
  const t = now();
  await db.runAsync(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    newId(), workoutId, exerciseId, (row?.p ?? -1) + 1, t, t,
  );
}

// ───────────────────────── Sets ─────────────────────────

export function listSets(db: SQLiteDatabase, workoutId: string, exerciseId: string): Promise<WorkoutSet[]> {
  return db.getAllAsync<WorkoutSet>(
    `SELECT id, workout_id, exercise_id, set_index, weight, reps, load_type, created_at FROM workout_sets
     WHERE workout_id = ? AND exercise_id = ? AND deleted_at IS NULL
     ORDER BY set_index`,
    workoutId, exerciseId,
  );
}

export function listAllSetsForWorkout(db: SQLiteDatabase, workoutId: string): Promise<(WorkoutSet & { name: string; load_type: LoadType })[]> {
  return db.getAllAsync(
    `SELECT s.id, s.workout_id, s.exercise_id, s.set_index, s.weight, s.reps, s.load_type, s.created_at, e.name
     FROM workout_sets s JOIN exercises e ON e.id = s.exercise_id
     WHERE s.workout_id = ? AND s.deleted_at IS NULL
     ORDER BY s.created_at`,
    workoutId,
  );
}

export async function addSet(
  db: SQLiteDatabase,
  workoutId: string,
  exerciseId: string,
  weight: number,
  reps: number,
): Promise<void> {
  const row = await db.getFirstAsync<{ i: number | null }>(
    'SELECT MAX(set_index) AS i FROM workout_sets WHERE workout_id = ? AND exercise_id = ? AND deleted_at IS NULL',
    workoutId, exerciseId,
  );
  const t = now();
  await db.runAsync(
    `INSERT INTO workout_sets (id, workout_id, exercise_id, set_index, weight, reps, load_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?,
             COALESCE((SELECT load_type FROM exercises WHERE id = ?), 'weight'),
             ?, ?)`,
    newId(), workoutId, exerciseId, (row?.i ?? 0) + 1, weight, reps, exerciseId, t, t,
  );
}

export async function updateSet(db: SQLiteDatabase, setId: string, weight: number, reps: number): Promise<void> {
  await db.runAsync(
    'UPDATE workout_sets SET weight = ?, reps = ?, updated_at = ? WHERE id = ?',
    weight, reps, now(), setId,
  );
}

export async function deleteSet(db: SQLiteDatabase, setId: string): Promise<void> {
  const t = now();
  await db.runAsync('UPDATE workout_sets SET deleted_at = ?, updated_at = ? WHERE id = ?', t, t, setId);
}

/**
 * Sets from the most recent workout before `before` (a workout's started_at) that included this
 * exercise. The cut-off matters when logging or editing a past workout: it compares against what
 * came before it, not against newer workouts.
 */
export async function previousSets(
  db: SQLiteDatabase,
  exerciseId: string,
  excludeWorkoutId: string,
  before: number,
): Promise<{ started_at: number; sets: WorkoutSet[] } | null> {
  const last = await db.getFirstAsync<{ id: string; started_at: number }>(
    `SELECT w.id, w.started_at FROM workouts w
     WHERE w.deleted_at IS NULL AND w.id <> ? AND w.started_at < ?
       AND EXISTS (SELECT 1 FROM workout_sets s
                   WHERE s.workout_id = w.id AND s.exercise_id = ? AND s.deleted_at IS NULL)
     ORDER BY w.started_at DESC LIMIT 1`,
    excludeWorkoutId, before, exerciseId,
  );
  if (!last) return null;
  return { started_at: last.started_at, sets: await listSets(db, last.id, exerciseId) };
}

// ───────────────────────── Progress ─────────────────────────

/** Exercises that have at least one logged set, most recently done first, then most-trained. */
export function listTrainedExercises(db: SQLiteDatabase): Promise<TrainedExercise[]> {
  return db.getAllAsync(
    `SELECT e.id, e.name, ${MUSCLE_GROUPS_LABEL} AS muscle_groups, e.load_type,
            COUNT(DISTINCT s.workout_id) AS session_count, MAX(w.started_at) AS last_at
     FROM exercises e
     JOIN workout_sets s ON s.exercise_id = e.id AND s.deleted_at IS NULL
     JOIN workouts w ON w.id = s.workout_id AND w.deleted_at IS NULL
     GROUP BY e.id
     ORDER BY last_at DESC, session_count DESC, e.name COLLATE NOCASE`,
  );
}

/**
 * Per-workout aggregates for one exercise, oldest first.
 * best_e1rm uses the Epley formula: weight × (1 + reps / 30).
 */
export function exerciseStats(
  db: SQLiteDatabase,
  exerciseId: string,
  loadType: LoadType,
): Promise<ExerciseSessionStats[]> {
  return db.getAllAsync<ExerciseSessionStats>(
    `SELECT w.id AS workout_id, w.started_at,
            MAX(s.weight)                                         AS top_weight,
            MAX(CASE WHEN s.reps = 1 THEN s.weight
                     ELSE s.weight * (1.0 + s.reps / 30.0) END)   AS best_e1rm,
            SUM(s.weight * s.reps)                                AS volume,
            SUM(s.reps)                                           AS total_reps,
            COUNT(*)                                              AS set_count
     FROM workout_sets s
     JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ? AND s.load_type = ? AND s.deleted_at IS NULL AND w.deleted_at IS NULL
     GROUP BY w.id
     ORDER BY w.started_at`,
    exerciseId, loadType,
  );
}

/** The units this exercise has sets logged in (e.g. both, after switching gyms). */
export async function listLoggedUnits(db: SQLiteDatabase, exerciseId: string): Promise<LoadType[]> {
  const rows = await db.getAllAsync<{ load_type: LoadType }>(
    `SELECT DISTINCT s.load_type
     FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
     WHERE s.exercise_id = ? AND s.deleted_at IS NULL AND w.deleted_at IS NULL`,
    exerciseId,
  );
  return rows.map((r) => r.load_type);
}

// ───────────────────────── Backup (JSON export / import) ─────────────────────────

/**
 * Everything worth keeping, as a BackupFile: exercises (plus deleted ones that history still
 * uses), routines, and finished workouts with their sets. A workout in progress is left out.
 */
export async function exportBackup(db: SQLiteDatabase): Promise<BackupFile> {
  const exRows = await db.getAllAsync<{ id: string; name: string; load_type: LoadType; deleted: number }>(
    `SELECT e.id, e.name, e.load_type, e.deleted_at IS NOT NULL AS deleted
     FROM exercises e
     WHERE e.deleted_at IS NULL
        OR EXISTS (SELECT 1 FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
                   WHERE s.exercise_id = e.id AND s.deleted_at IS NULL AND w.deleted_at IS NULL)
     ORDER BY e.deleted_at IS NOT NULL, e.name COLLATE NOCASE`,
  );
  const links = await listExerciseMuscleGroupLinks(db);

  // The file references exercises by name, so names must be unique within it
  const fileName = new Map<string, string>();
  const used = new Set<string>();
  const exercises: BackupExercise[] = exRows.map((e) => {
    let name = e.name;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${e.name} (${n})`;
    used.add(name.toLowerCase());
    fileName.set(e.id, name);
    return {
      id: e.id,
      name,
      loadType: e.load_type,
      muscleGroups: links.filter((l) => l.exercise_id === e.id).map((l) => l.name).sort(),
      ...(e.deleted ? { deleted: true } : {}),
    };
  });

  const routineRows = await db.getAllAsync<{ id: string; name: string }>(
    'SELECT id, name FROM routines WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE',
  );
  const routines = [];
  for (const r of routineRows) {
    const items = await listRoutineExercises(db, r.id);
    routines.push({ id: r.id, name: r.name, exercises: items.map((x) => fileName.get(x.exercise_id) ?? x.name) });
  }

  const workoutRows = await db.getAllAsync<Workout>(
    `SELECT id, routine_id, routine_name, started_at, ended_at, notes FROM workouts
     WHERE deleted_at IS NULL AND ended_at IS NOT NULL ORDER BY started_at`,
  );
  const workouts: BackupWorkout[] = [];
  for (const w of workoutRows) {
    const order = await db.getAllAsync<{ exercise_id: string }>(
      'SELECT exercise_id FROM workout_exercises WHERE workout_id = ? AND deleted_at IS NULL ORDER BY position',
      w.id,
    );
    const sets = await db.getAllAsync<WorkoutSet>(
      `SELECT id, workout_id, exercise_id, set_index, weight, reps, load_type, created_at FROM workout_sets
       WHERE workout_id = ? AND deleted_at IS NULL ORDER BY set_index`,
      w.id,
    );
    // Listed exercises first (even with no sets), then any that only have sets
    const ids = [...new Set([...order.map((o) => o.exercise_id), ...sets.map((s) => s.exercise_id)])];
    workouts.push({
      id: w.id,
      routine: w.routine_name,
      startedAt: toLocalIso(w.started_at),
      endedAt: toLocalIso(w.ended_at ?? w.started_at),
      notes: w.notes,
      exercises: ids
        .filter((id) => fileName.has(id))
        .map((id) => ({
          exercise: fileName.get(id)!,
          sets: sets
            .filter((s) => s.exercise_id === id)
            .map((s) => ({ id: s.id, weight: s.weight, reps: s.reps, loadType: s.load_type })),
        })),
    });
  }

  return { format: 'workout-manager', version: 1, exportedAt: toLocalIso(now()), exercises, routines, workouts };
}

/**
 * Adds a BackupFile's contents to the database, in one transaction. Additive only: nothing on
 * the phone is changed or deleted.
 *  - Exercises match by id, then by name (case-insensitive); unmatched ones are created.
 *  - Routines are skipped if their id or name already exists.
 *  - Workouts are skipped if their id already exists, so importing the same file twice is harmless.
 */
export async function importBackup(db: SQLiteDatabase, file: BackupFile): Promise<ImportResult> {
  const result: ImportResult = {
    exercisesAdded: 0,
    exercisesMatched: 0,
    routinesAdded: 0,
    workoutsAdded: 0,
    workoutsSkipped: 0,
    setsAdded: 0,
  };
  const t = now();

  await db.withTransactionAsync(async () => {
    // Exercises: file name (lower case) -> database id, and database id -> current unit
    const exId = new Map<string, string>();
    const exLoad = new Map<string, LoadType>();
    for (const e of file.exercises) {
      let row = e.id
        ? await db.getFirstAsync<{ id: string; load_type: LoadType }>('SELECT id, load_type FROM exercises WHERE id = ?', e.id)
        : null;
      if (!row && !e.deleted) {
        row = await db.getFirstAsync<{ id: string; load_type: LoadType }>(
          `SELECT id, load_type FROM exercises WHERE lower(name) = lower(?) AND deleted_at IS NULL
           ORDER BY created_at LIMIT 1`,
          e.name,
        );
      }
      if (row) {
        result.exercisesMatched++;
      } else {
        const id = e.id ?? newId();
        const loadType = e.loadType ?? 'weight';
        await db.runAsync(
          'INSERT INTO exercises (id, name, load_type, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
          id, e.name, loadType, t, t, e.deleted ? t : null,
        );
        for (const g of new Set(e.muscleGroups ?? [])) {
          const groupId = await findOrInsertMuscleGroup(db, g, t);
          await db.runAsync(
            'INSERT INTO exercise_muscle_groups (id, exercise_id, muscle_group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            newId(), id, groupId, t, t,
          );
        }
        row = { id, load_type: loadType };
        result.exercisesAdded++;
      }
      exId.set(e.name.toLowerCase(), row.id);
      exLoad.set(row.id, row.load_type);
    }

    for (const r of file.routines ?? []) {
      const exists = await db.getFirstAsync(
        'SELECT 1 FROM routines WHERE id = ? OR (lower(name) = lower(?) AND deleted_at IS NULL)',
        r.id ?? '', r.name,
      );
      if (exists) continue;
      const id = r.id ?? newId();
      await db.runAsync('INSERT INTO routines (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', id, r.name, t, t);
      const ids = [...new Set(r.exercises.map((n) => exId.get(n.toLowerCase())!))];
      for (let i = 0; i < ids.length; i++) {
        await db.runAsync(
          `INSERT INTO routine_exercises (id, routine_id, exercise_id, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          newId(), id, ids[i], i, t, t,
        );
      }
      result.routinesAdded++;
    }

    for (const w of file.workouts) {
      if (w.id && (await db.getFirstAsync('SELECT 1 FROM workouts WHERE id = ?', w.id))) {
        result.workoutsSkipped++;
        continue;
      }
      const id = w.id ?? newId();
      const startedAt = fromLocalIso(w.startedAt)!;
      const endedAt = w.endedAt ? fromLocalIso(w.endedAt)! : startedAt; // imports are always finished
      const routine = w.routine
        ? await db.getFirstAsync<{ id: string }>(
            'SELECT id FROM routines WHERE lower(name) = lower(?) AND deleted_at IS NULL',
            w.routine,
          )
        : null;
      await db.runAsync(
        `INSERT INTO workouts (id, routine_id, routine_name, started_at, ended_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id, routine?.id ?? null, w.routine ?? null, startedAt, endedAt, w.notes ?? null, t, t,
      );

      // Merge repeated entries for the same exercise, keeping first-seen order
      const byExercise = new Map<string, BackupWorkout['exercises'][number]['sets']>();
      for (const we of w.exercises) {
        const eid = exId.get(we.exercise.toLowerCase())!;
        byExercise.set(eid, [...(byExercise.get(eid) ?? []), ...we.sets]);
      }
      // Spread set timestamps across the workout so ordering by created_at matches the file
      const total = [...byExercise.values()].reduce((n, s) => n + s.length, 0);
      const step = (endedAt - startedAt) / (total + 1);
      let seq = 0;
      let position = 0;
      for (const [eid, sets] of byExercise) {
        await db.runAsync(
          `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          newId(), id, eid, position++, t, t,
        );
        for (let i = 0; i < sets.length; i++) {
          const s = sets[i];
          const taken = s.id ? await db.getFirstAsync('SELECT 1 FROM workout_sets WHERE id = ?', s.id) : null;
          await db.runAsync(
            `INSERT INTO workout_sets (id, workout_id, exercise_id, set_index, weight, reps, load_type, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            s.id && !taken ? s.id : newId(), id, eid, i + 1, s.weight, s.reps,
            s.loadType ?? exLoad.get(eid) ?? 'weight', Math.round(startedAt + step * ++seq), t,
          );
          result.setsAdded++;
        }
      }
      result.workoutsAdded++;
    }
  });

  return result;
}
