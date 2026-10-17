/** How an exercise's load is measured: kilograms, or a machine's level number. */
export type LoadType = 'weight' | 'level';

export interface Exercise {
  id: string;
  name: string;
  /** Display label of the exercise's muscle groups, e.g. "Chest, Shoulders"; null if none. */
  muscle_groups: string | null;
  load_type: LoadType;
}

export interface MuscleGroup {
  id: string;
  name: string;
}

export interface Routine {
  id: string;
  name: string;
  exercise_count: number;
}

export interface RoutineExercise {
  id: string; // routine_exercises.id
  exercise_id: string;
  name: string;
  /** Display label of the exercise's muscle groups, e.g. "Chest, Shoulders"; null if none. */
  muscle_groups: string | null;
  load_type: LoadType;
  position: number;
}

export interface Workout {
  id: string;
  routine_id: string | null;
  routine_name: string | null;
  started_at: number;
  ended_at: number | null;
  notes: string | null;
}

export interface WorkoutSummary extends Workout {
  set_count: number;
  exercise_count: number;
  volume: number;
}

export interface WorkoutExercise {
  id: string; // workout_exercises.id
  exercise_id: string;
  name: string;
  load_type: LoadType;
  position: number;
  set_count: number;
}

export interface WorkoutSet {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_index: number;
  weight: number;
  reps: number;
  /** Unit this set was logged in (copied from the exercise at logging time). */
  load_type: LoadType;
  created_at: number;
}

/** One point per workout for a given exercise — feeds the progress charts. */
export interface ExerciseSessionStats {
  workout_id: string;
  started_at: number;
  top_weight: number;
  best_e1rm: number;
  volume: number;
  total_reps: number;
  set_count: number;
}

// ───────────────────────── Backup file (JSON export / import) ─────────────────────────
// Human-readable and nested. Exercises and routines are referenced by name within the file.
// Ids are optional: when present, importing the same file twice adds nothing new.
// Times are local "YYYY-MM-DDTHH:mm" strings.

export interface BackupFile {
  format: 'workout-manager';
  version: 1;
  exportedAt?: string;
  exercises: BackupExercise[];
  routines?: BackupRoutine[];
  workouts: BackupWorkout[];
}

export interface BackupExercise {
  id?: string;
  name: string;
  loadType?: LoadType;
  muscleGroups?: string[];
  /** Deleted in the app but still referenced by logged sets. */
  deleted?: boolean;
}

export interface BackupRoutine {
  id?: string;
  name: string;
  /** Exercise names, in order. */
  exercises: string[];
}

export interface BackupWorkout {
  id?: string;
  /** Routine name (the snapshot shown in history); null for an empty workout. */
  routine?: string | null;
  startedAt: string;
  endedAt?: string | null;
  notes?: string | null;
  exercises: { exercise: string; sets: BackupSet[] }[];
}

export interface BackupSet {
  id?: string;
  weight: number;
  reps: number;
  /** Defaults to the exercise's unit. */
  loadType?: LoadType;
}

export interface ImportResult {
  exercisesAdded: number;
  exercisesMatched: number;
  routinesAdded: number;
  workoutsAdded: number;
  workoutsSkipped: number;
  setsAdded: number;
}
