# Workout Manager

A personal workout log for Android (iPhone later). React Native + Expo SDK 57, TypeScript, with all data in SQLite on the phone.

## Running it

You need Node.js 22+ and the Expo Go app on the phone.

```
npm run setup      # npm install, then npx expo install --fix to align versions with the SDK
npm run typecheck  # tsc --noEmit
npx expo start     # scan the QR code from Expo Go; phone and PC on the same Wi-Fi
```

If the phone can't reach the PC, use `npx expo start --tunnel`. Saving a file reloads the app on the phone.

There are no tests, linter or formatter yet.

## What it does

- **Train:** start a workout from a routine or empty, resume one in progress, or log a past workout for a chosen date, start time and duration.
- **Routines:** named, ordered groups of exercises. Not tied to weekdays.
- **Exercises:** the exercise library, grouped by muscle group. An exercise can belong to several groups, picked from a shared list you can add to.
- **Progress:** pick an exercise from a searchable dropdown to see its chart (estimated 1RM, top weight, volume; or top level and total reps for machine exercises), its recent sessions, and recent workouts. "See all" opens the full history grouped by month.
- **Settings** (gear in the header): colour theme (Lime, Purple, Ocean, Ember, Light) and JSON export/import.

During a workout, pick the exercise you're on, see what you did last time, and log weight and reps with the −/+ steppers. Tap a set to edit it and long-press to delete it. Long-press an exercise to switch it between kg and machine levels. Each set keeps the unit it was logged in, so history stays correct after a switch.

Finished workouts can be edited from their summary screen.

## Backups

Settings → Export writes everything to a JSON file and opens the share sheet. Import reads such a file back. It only adds what's missing (matching by id, then by exercise name), so importing the same file twice changes nothing. The format is `BackupFile` in `src/db/types.ts`.

Uninstalling the app deletes its data. To update, install a new APK over the old one.

## Building an APK

```
eas build -p android --profile preview
```

This builds in Expo's cloud and gives you an installable `.apk`. The project is already linked to EAS (`eas.json`, `app.json`).

## Code layout

```
app/                  screens; the file path is the route (expo-router)
  _layout.tsx         opens the database, runs migrations, sets up theme and navigation
  (tabs)/             Train, Routines, Exercises, Progress
  routine/[id].tsx    routine editor
  workout/[id].tsx    workout logging and finished-workout summary
  workout/past.tsx    log a past workout
  history.tsx         full history list
  settings.tsx        theme and backup
src/
  db/migrations.ts    schema migrations, versioned with PRAGMA user_version
  db/repo.ts          all SQL
  db/types.ts         row and backup-file types
  components/         shared UI (buttons, cards, steppers, dialogs, chart, pickers)
  lib/                formatting, ids, backup parsing, file sharing
  theme.ts            themes, useTheme(), spacing
```

## Data

```
muscle_groups ─< exercise_muscle_groups >─ exercises
exercises ─┬─< routine_exercises >── routines
           ├─< workout_exercises >─┐
           └─< workout_sets ───────┴── workouts
```

Every table has a client-generated UUID `id`, `created_at`/`updated_at` in epoch milliseconds, and a `deleted_at` column for soft deletes. This is so a sync server can be added later without remapping ids.

Conventions:

- Screens never run SQL; it all goes through `src/db/repo.ts`.
- To change the schema, append to `MIGRATIONS` in `src/db/migrations.ts`. Never edit an existing migration, because phones may already have run it.
- `load_type` (`'weight'` or `'level'`) is stored on both the exercise (its current unit) and each set (the unit it was logged in). Volume only counts weight sets, and charts show one unit at a time.
- Colours come from `useTheme()`. Don't hardcode them.
