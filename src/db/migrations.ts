import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Schema migrations, applied in order on app start.
 *
 * The database stores its current version in `PRAGMA user_version`.
 * To change the schema: append a new entry to MIGRATIONS (never edit an old one).
 *
 * Sync-readiness conventions (for the future server):
 *  - every id is a client-generated UUID (no autoincrement), so rows created
 *    offline on several devices never collide;
 *  - every table has created_at / updated_at (epoch ms) for last-write-wins merging;
 *  - rows are soft-deleted via deleted_at so deletions can be synced too.
 */
const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE exercises (
    id           TEXT PRIMARY KEY NOT NULL,
    name         TEXT NOT NULL,
    muscle_group TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    deleted_at   INTEGER
  );

  CREATE TABLE routines (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

  CREATE TABLE routine_exercises (
    id          TEXT PRIMARY KEY NOT NULL,
    routine_id  TEXT NOT NULL REFERENCES routines(id),
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    position    INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
  );
  CREATE INDEX idx_routine_exercises_routine ON routine_exercises(routine_id);

  CREATE TABLE workouts (
    id           TEXT PRIMARY KEY NOT NULL,
    routine_id   TEXT REFERENCES routines(id),
    routine_name TEXT,
    started_at   INTEGER NOT NULL,
    ended_at     INTEGER,
    notes        TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    deleted_at   INTEGER
  );
  CREATE INDEX idx_workouts_started ON workouts(started_at);

  -- Exercises picked for a particular workout (snapshot of the routine + ad-hoc additions)
  CREATE TABLE workout_exercises (
    id          TEXT PRIMARY KEY NOT NULL,
    workout_id  TEXT NOT NULL REFERENCES workouts(id),
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    position    INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
  );
  CREATE INDEX idx_workout_exercises_workout ON workout_exercises(workout_id);

  CREATE TABLE workout_sets (
    id          TEXT PRIMARY KEY NOT NULL,
    workout_id  TEXT NOT NULL REFERENCES workouts(id),
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    set_index   INTEGER NOT NULL,
    weight      REAL NOT NULL,
    reps        INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER
  );
  CREATE INDEX idx_workout_sets_workout ON workout_sets(workout_id);
  CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);
  `,

  // v2 — machines that use a tier number instead of kg
  `ALTER TABLE exercises ADD COLUMN load_type TEXT NOT NULL DEFAULT 'weight';`,

  // v3 — renamed 'tier' to 'level' (the common term for machine settings)
  `UPDATE exercises SET load_type = 'level' WHERE load_type = 'tier';`,

  // v4 — each set remembers its own unit, so switching an exercise kg <-> level
  //      only affects new sets; existing sets take their exercise's current unit
  `
  ALTER TABLE workout_sets ADD COLUMN load_type TEXT NOT NULL DEFAULT 'weight';
  UPDATE workout_sets
     SET load_type = COALESCE((SELECT e.load_type FROM exercises e WHERE e.id = workout_sets.exercise_id), 'weight');
  `,

  // v5 — an exercise can belong to several muscle groups, picked from a shared list.
  //      Existing free-text exercises.muscle_group values become rows (case-insensitively
  //      de-duplicated) and get linked. The old column stays but is no longer read or written.
  //      UUIDs are built from randomblob() in v4 format, since SQLite has no uuid function.
  `
  CREATE TABLE muscle_groups (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

  CREATE TABLE exercise_muscle_groups (
    id              TEXT PRIMARY KEY NOT NULL,
    exercise_id     TEXT NOT NULL REFERENCES exercises(id),
    muscle_group_id TEXT NOT NULL REFERENCES muscle_groups(id),
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    deleted_at      INTEGER
  );
  CREATE INDEX idx_exercise_muscle_groups_exercise ON exercise_muscle_groups(exercise_id);
  CREATE INDEX idx_exercise_muscle_groups_group ON exercise_muscle_groups(muscle_group_id);

  INSERT INTO muscle_groups (id, name, created_at, updated_at)
  SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
         substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) ||
         substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
         MIN(TRIM(muscle_group)),
         CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
         CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  FROM exercises
  WHERE muscle_group IS NOT NULL AND TRIM(muscle_group) <> ''
  GROUP BY lower(TRIM(muscle_group));

  INSERT INTO exercise_muscle_groups (id, exercise_id, muscle_group_id, created_at, updated_at)
  SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
         substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) ||
         substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
         e.id, mg.id,
         CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
         CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  FROM exercises e
  JOIN muscle_groups mg ON lower(mg.name) = lower(TRIM(e.muscle_group));
  `,

  // v6 — the predefined exercises get specific muscles instead of one broad region
  //      (e.g. Bench Press: Chest, Shoulders, Triceps instead of Chest). Only exercises the user
  //      hasn't touched are changed: same name as seeded, not deleted, and still linked to exactly
  //      their one original group. Groups that end up unused (e.g. "Legs") stay in the list.
  //      Mirrors DEFAULT_EXERCISES in repo.ts.
  `
  CREATE TEMP TABLE _v6_seed (name TEXT NOT NULL, old_group TEXT NOT NULL, new_group TEXT NOT NULL);
  INSERT INTO _v6_seed (name, old_group, new_group) VALUES
    ('Bench Press', 'Chest', 'Chest'), ('Bench Press', 'Chest', 'Shoulders'), ('Bench Press', 'Chest', 'Triceps'),
    ('Incline Dumbbell Press', 'Chest', 'Chest'), ('Incline Dumbbell Press', 'Chest', 'Shoulders'),
    ('Incline Dumbbell Press', 'Chest', 'Triceps'),
    ('Overhead Press', 'Shoulders', 'Shoulders'), ('Overhead Press', 'Shoulders', 'Triceps'),
    ('Lateral Raise', 'Shoulders', 'Shoulders'),
    ('Squat', 'Legs', 'Quads'), ('Squat', 'Legs', 'Glutes'),
    ('Romanian Deadlift', 'Legs', 'Hamstrings'), ('Romanian Deadlift', 'Legs', 'Glutes'),
    ('Romanian Deadlift', 'Legs', 'Lower back'),
    ('Leg Press', 'Legs', 'Quads'), ('Leg Press', 'Legs', 'Glutes'),
    ('Deadlift', 'Back', 'Hamstrings'), ('Deadlift', 'Back', 'Glutes'), ('Deadlift', 'Back', 'Lower back'),
    ('Deadlift', 'Back', 'Upper back'),
    ('Pull-up', 'Back', 'Lats'), ('Pull-up', 'Back', 'Biceps'),
    ('Barbell Row', 'Back', 'Upper back'), ('Barbell Row', 'Back', 'Lats'), ('Barbell Row', 'Back', 'Biceps'),
    ('Lat Pulldown', 'Back', 'Lats'), ('Lat Pulldown', 'Back', 'Biceps'),
    ('Biceps Curl', 'Arms', 'Biceps'),
    ('Triceps Pushdown', 'Arms', 'Triceps');

  -- Untouched predefined exercises: one active link, to the original group
  CREATE TEMP TABLE _v6_targets AS
  SELECT e.id AS exercise_id, e.name
  FROM exercises e
  WHERE e.deleted_at IS NULL
    AND e.name IN (SELECT name FROM _v6_seed)
    AND (SELECT COUNT(*) FROM exercise_muscle_groups emg
         WHERE emg.exercise_id = e.id AND emg.deleted_at IS NULL) = 1
    AND EXISTS (SELECT 1 FROM exercise_muscle_groups emg
                JOIN muscle_groups mg ON mg.id = emg.muscle_group_id
                WHERE emg.exercise_id = e.id AND emg.deleted_at IS NULL
                  AND lower(mg.name) = lower((SELECT old_group FROM _v6_seed s WHERE s.name = e.name LIMIT 1)));

  -- Add the groups those exercises need, if the list doesn't have them yet (any case)
  INSERT INTO muscle_groups (id, name, created_at, updated_at)
  SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
         substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) ||
         substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
         s.new_group,
         CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
         CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  FROM (SELECT DISTINCT s.new_group FROM _v6_seed s JOIN _v6_targets t ON t.name = s.name) s
  WHERE NOT EXISTS (SELECT 1 FROM muscle_groups mg
                    WHERE lower(mg.name) = lower(s.new_group) AND mg.deleted_at IS NULL);

  -- Soft-delete links that aren't in the new set (e.g. Squat -> Legs); keep ones that are (Lateral Raise)
  UPDATE exercise_muscle_groups
     SET deleted_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
         updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE deleted_at IS NULL
     AND exercise_id IN (SELECT exercise_id FROM _v6_targets)
     AND NOT EXISTS (
       SELECT 1 FROM _v6_targets t
       JOIN _v6_seed s ON s.name = t.name
       JOIN muscle_groups mg ON lower(mg.name) = lower(s.new_group) AND mg.deleted_at IS NULL
       WHERE t.exercise_id = exercise_muscle_groups.exercise_id
         AND mg.id = exercise_muscle_groups.muscle_group_id);

  -- Link the new groups that aren't linked yet
  INSERT INTO exercise_muscle_groups (id, exercise_id, muscle_group_id, created_at, updated_at)
  SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
         substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) ||
         substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
         t.exercise_id, mg.id,
         CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
         CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
  FROM _v6_targets t
  JOIN _v6_seed s ON s.name = t.name
  JOIN muscle_groups mg ON lower(mg.name) = lower(s.new_group) AND mg.deleted_at IS NULL
  WHERE NOT EXISTS (SELECT 1 FROM exercise_muscle_groups emg
                    WHERE emg.exercise_id = t.exercise_id AND emg.muscle_group_id = mg.id
                      AND emg.deleted_at IS NULL);

  DROP TABLE _v6_targets;
  DROP TABLE _v6_seed;
  `,

  // v7 — routines get a user-defined order (drag and drop on the Train tab). Existing routines are
  //      numbered in the order they were shown until now (alphabetical, case-insensitive; id breaks
  //      ties), so nothing visibly moves.
  `
  ALTER TABLE routines ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
  UPDATE routines
     SET position = (SELECT COUNT(*) FROM routines r2
                     WHERE lower(r2.name) < lower(routines.name)
                        OR (lower(r2.name) = lower(routines.name) AND r2.id < routines.id));
  `,

  // v8 — close gaps in set numbering left by deleted sets ("Set 1, Set 3" -> "Set 1, Set 2").
  //      From now on deleteSet renumbers as it goes; this fixes sets deleted before that. Each
  //      live set's new index is its rank within (workout, exercise) by the old index (id breaks
  //      ties). The ranks go into a temp table first so the UPDATE never reads half-updated rows,
  //      and only rows whose number actually changes are touched (and get a new updated_at).
  `
  CREATE TEMP TABLE _v8_renumber AS
  SELECT s.id,
         (SELECT COUNT(*) FROM workout_sets s2
          WHERE s2.workout_id = s.workout_id AND s2.exercise_id = s.exercise_id AND s2.deleted_at IS NULL
            AND (s2.set_index < s.set_index OR (s2.set_index = s.set_index AND s2.id < s.id))) + 1 AS new_index
  FROM workout_sets s
  WHERE s.deleted_at IS NULL;

  UPDATE workout_sets
     SET set_index = (SELECT new_index FROM _v8_renumber r WHERE r.id = workout_sets.id),
         updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id IN (SELECT r.id FROM _v8_renumber r JOIN workout_sets w ON w.id = r.id WHERE w.set_index <> r.new_index);

  DROP TABLE _v8_renumber;
  `,

  // v9 — an exercise can be marked finished within a workout ("Finish exercise"), which moves its
  //      card into the Finished part of the workout overview. NULL = still active; nothing existing
  //      changes.
  `
  ALTER TABLE workout_exercises ADD COLUMN finished_at INTEGER;
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
