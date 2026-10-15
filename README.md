# Workout Manager

A phone app (Android + iPhone) for logging workouts. Built with **React Native + Expo** in TypeScript. All data is stored on the phone in **SQLite**.

## Run it on your phone (Windows)

1. Install **Node.js LTS** (22 or newer) from https://nodejs.org if you don't have it. Check with `node -v`.
2. Install **Expo Go** on your phone (Play Store / App Store).
3. Open a terminal in this folder and run, once:
   ```
   npm run setup
   ```
   This installs the latest Expo SDK and the library versions that match it.
4. Start the dev server:
   ```
   npx expo start
   ```
   Scan the QR code. On **Android**, scan it from inside Expo Go. On **iPhone**, use the Camera app.
   Your phone and PC must be on the same Wi-Fi. If they aren't, or the phone can't connect, use `npx expo start --tunnel`.
   If Windows Firewall asks about Node.js, allow it on private networks.

Save any file and the app reloads on your phone right away. To force a full reload, shake the phone and tap *Reload*.

## How the app works

| Tab | What it does |
|---|---|
| **Train** | Start a workout from one of your routines (or an empty one). Resume an in-progress workout. |
| **Routines** | Create named groups of exercises ("Push day", "Legs"…). They aren't tied to weekdays. |
| **Exercises** | Your exercise library. It starts with ~13 common lifts, and you can add, rename or delete. |
| **Progress** | Per-exercise chart (estimated 1RM / top weight / volume) plus your workout history. |

While a workout is running, pick the exercise you're on. The screen shows what you lifted *last time*. Enter kg and reps with the big −/+ steppers and tap **Log set**. Tap a logged set to edit it, or long-press it to delete it.

## Project layout

```
app/                      ← screens; file path = route (expo-router, like Next.js)
  _layout.tsx             ← root: opens the DB, runs migrations, sets up navigation
  (tabs)/                 ← the 4 bottom tabs
  routine/[id].tsx        ← routine editor
  workout/[id].tsx        ← active workout logging + finished-workout summary
src/
  db/migrations.ts        ← schema, versioned with PRAGMA user_version
  db/repo.ts              ← ALL SQL lives here (screens never write SQL)
  db/types.ts             ← row types
  components/             ← UI kit, exercise picker, SVG line chart
  theme.ts                ← colours, spacing, type
```

## Data model

```
exercises ─┐
           ├─< routine_exercises >── routines
           ├─< workout_exercises >─┐
           └─< workout_sets ───────┴── workouts
```

Every table uses **UUID primary keys**, `created_at`/`updated_at`, and a `deleted_at` soft-delete column. That makes adding a server later straightforward: the phone pushes rows whose `updated_at` is newer than the last sync, and the server merges them (last write wins). No ids need remapping.

To change the schema, **append** a new SQL string to `MIGRATIONS` in `src/db/migrations.ts`. Never edit an existing one.

## Later: building a real installable app

Expo Go is for development. To get a standalone app on your phone without the dev server, use EAS Build (`npm i -g eas-cli`, then `eas build -p android --profile preview`). It builds in the cloud, so iPhone builds don't need a Mac. You do need an Apple Developer account ($99/yr) to install on an iPhone outside Expo Go.
