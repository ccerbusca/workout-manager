import { Storage } from 'expo-sqlite/kv-store';

/*
 * Small device-local preferences, kept in expo-sqlite's key-value store (not the workouts DB,
 * so no migrations and not part of backups). Reads are synchronous so they're usable during render.
 */

function read(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    Storage.setItemSync(key, value);
  } catch {
    // Not saved: the value still applies until the app restarts
  }
}

export const prefs = {
  /** Start the rest timer automatically after logging a set. Default on. */
  getRestAutoStart: (): boolean => read('rest.autoStart') !== 'false',
  setRestAutoStart: (on: boolean) => write('rest.autoStart', String(on)),

  /** Last chosen rest length in seconds. Default 90. */
  getRestSeconds: (): number => {
    const n = Number(read('rest.seconds'));
    return Number.isFinite(n) && n >= 5 ? n : 90;
  },
  setRestSeconds: (s: number) => write('rest.seconds', String(Math.round(s))),

  /** Workouts per week that count toward the streak (Mon–Sun). Default 3. */
  getWeeklyGoal: (): number => {
    const n = Number(read('consistency.weeklyGoal'));
    return Number.isInteger(n) && n >= 1 && n <= 7 ? n : 3;
  },
  setWeeklyGoal: (n: number) => write('consistency.weeklyGoal', String(n)),

  /**
   * The user's bodyweight in kg, for the volume of bodyweight sets ((bodyweight + added) × reps).
   * 0 = not set: bodyweight sets then count 0 toward volume. One value, applied to all history.
   */
  getBodyweight: (): number => {
    const n = Number(read('body.weightKg'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  },
  setBodyweight: (kg: number) => write('body.weightKg', String(kg > 0 ? Math.round(kg * 10) / 10 : 0)),

  /** Muscle-group sections collapsed on the Exercises tab, by group name ("Other" included). */
  getCollapsedGroups: (): string[] => {
    try {
      const v = JSON.parse(read('exercises.collapsedGroups') ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  },
  setCollapsedGroups: (names: string[]) => write('exercises.collapsedGroups', JSON.stringify(names)),
};
