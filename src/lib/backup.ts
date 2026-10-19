import type { BackupExercise, BackupFile, BackupRoutine, BackupSet, BackupWorkout, LoadType } from '../db/types';

/*
 * Pure helpers for the JSON backup format (see BackupFile in db/types.ts).
 * No database access here: export/import SQL lives in db/repo.ts.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Epoch ms → local "YYYY-MM-DDTHH:mm" (no timezone, so the file reads like the app shows it). */
export function toLocalIso(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" or "…:ss" → epoch ms. Parsed by hand so it's always local time. */
export function fromLocalIso(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', sec = '0'] = m;
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +sec);
  // Rejects things like 2025-02-31, which Date would silently roll over
  return date.getMonth() === +mo - 1 && date.getDate() === +d ? date.getTime() : null;
}

/** Suggested file name, e.g. "workout-manager-2026-10-17.json". */
export function backupFileName(ms: number): string {
  return `workout-manager-${toLocalIso(ms).slice(0, 10)}.json`;
}

/**
 * Checks that parsed JSON is a usable backup and returns it typed. Throws an Error whose message
 * says what's wrong (shown to the user), e.g. 'workouts[3].startedAt: not a date'.
 */
export function parseBackup(json: unknown): BackupFile {
  const fail = (path: string, msg: string): never => {
    throw new Error(`${path}: ${msg}`);
  };
  const obj = (v: unknown, path: string) =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(path, 'expected an object');
  const arr = (v: unknown, path: string) => (Array.isArray(v) ? v : fail(path, 'expected a list'));
  const str = (v: unknown, path: string) => (typeof v === 'string' && v.trim() !== '' ? v : fail(path, 'expected text'));
  const optStr = (v: unknown, path: string) => (v == null ? undefined : str(v, path));
  const num = (v: unknown, path: string) => (typeof v === 'number' && Number.isFinite(v) ? v : fail(path, 'expected a number'));
  const loadType = (v: unknown, path: string): LoadType | undefined =>
    v == null ? undefined : v === 'weight' || v === 'level' || v === 'bodyweight' ? v : fail(path, "expected 'weight', 'level' or 'bodyweight'");
  const date = (v: unknown, path: string) => {
    const s = str(v, path);
    if (fromLocalIso(s) == null) fail(path, `not a date: "${s}" (use YYYY-MM-DDTHH:mm)`);
    return s;
  };

  const root = obj(json, 'file');
  if (root.format !== 'workout-manager') fail('format', 'this is not a Workout Manager backup');
  if (root.version !== 1) fail('version', `unsupported version ${String(root.version)}`);

  const exercises: BackupExercise[] = arr(root.exercises ?? [], 'exercises').map((v, i) => {
    const p = `exercises[${i}]`;
    const e = obj(v, p);
    return {
      id: optStr(e.id, `${p}.id`),
      name: str(e.name, `${p}.name`).trim(),
      loadType: loadType(e.loadType, `${p}.loadType`),
      muscleGroups: arr(e.muscleGroups ?? [], `${p}.muscleGroups`).map((g, j) => str(g, `${p}.muscleGroups[${j}]`).trim()),
      deleted: e.deleted === true,
    };
  });
  const names = new Set<string>();
  for (const e of exercises) {
    const key = e.name.toLowerCase();
    if (names.has(key)) fail('exercises', `"${e.name}" is listed twice`);
    names.add(key);
  }
  const ref = (v: unknown, path: string) => {
    const name = str(v, path).trim();
    if (!names.has(name.toLowerCase())) fail(path, `"${name}" is not in the exercises list`);
    return name;
  };

  const routines: BackupRoutine[] = arr(root.routines ?? [], 'routines').map((v, i) => {
    const p = `routines[${i}]`;
    const r = obj(v, p);
    return {
      id: optStr(r.id, `${p}.id`),
      name: str(r.name, `${p}.name`).trim(),
      exercises: arr(r.exercises, `${p}.exercises`).map((x, j) => ref(x, `${p}.exercises[${j}]`)),
    };
  });

  const workouts: BackupWorkout[] = arr(root.workouts ?? [], 'workouts').map((v, i) => {
    const p = `workouts[${i}]`;
    const w = obj(v, p);
    const startedAt = date(w.startedAt, `${p}.startedAt`);
    const endedAt = w.endedAt == null ? null : date(w.endedAt, `${p}.endedAt`);
    if (endedAt && fromLocalIso(endedAt)! < fromLocalIso(startedAt)!) fail(`${p}.endedAt`, 'is before startedAt');
    return {
      id: optStr(w.id, `${p}.id`),
      routine: w.routine == null ? null : str(w.routine, `${p}.routine`).trim(),
      startedAt,
      endedAt,
      notes: w.notes == null ? null : String(w.notes),
      exercises: arr(w.exercises, `${p}.exercises`).map((x, j) => {
        const q = `${p}.exercises[${j}]`;
        const we = obj(x, q);
        return {
          exercise: ref(we.exercise, `${q}.exercise`),
          sets: arr(we.sets, `${q}.sets`).map((s, k): BackupSet => {
            const sp = `${q}.sets[${k}]`;
            const so = obj(s, sp);
            const weight = num(so.weight, `${sp}.weight`);
            const reps = num(so.reps, `${sp}.reps`);
            const setUnit = loadType(so.loadType, `${sp}.loadType`);
            // Negative weight = machine assistance, only meaningful on a bodyweight set
            if (weight < 0 && setUnit !== 'bodyweight') fail(`${sp}.weight`, 'must be 0 or more (negative only on bodyweight sets)');
            if (reps < 1) fail(`${sp}.reps`, 'must be at least 1');
            return { id: optStr(so.id, `${sp}.id`), weight, reps: Math.round(reps), loadType: setUnit };
          }),
        };
      }),
    };
  });

  return { format: 'workout-manager', version: 1, exportedAt: optStr(root.exportedAt, 'exportedAt'), exercises, routines, workouts };
}
