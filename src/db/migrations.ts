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
