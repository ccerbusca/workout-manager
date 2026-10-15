/** How an exercise's load is measured: kilograms, or a machine's level number. */
export type LoadType = 'weight' | 'level';

export interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  load_type: LoadType;
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
  muscle_group: string | null;
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
