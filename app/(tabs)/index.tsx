import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  exportBackup,
  getActiveWorkout,
  importBackup,
  listRoutines,
  listWorkoutHistory,
  startWorkout,
} from '../../src/db/repo';
import { Dialog } from '../../src/components/Dialog';
import { backupFileName, fromLocalIso, parseBackup } from '../../src/lib/backup';
import { pickTextFile, shareJsonFile } from '../../src/lib/backupFiles';
import type { Routine, Workout, WorkoutSummary } from '../../src/db/types';
import { Button, Card, Empty, SectionTitle } from '../../src/components/ui';
import { formatDate, formatDuration, formatTime, formatVolume } from '../../src/lib/format';
import { colors, font, space } from '../../src/theme';

export default function TrainScreen() {
  const db = useSQLiteContext();
  const [active, setActive] = useState<Workout | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [recent, setRecent] = useState<WorkoutSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setActive(await getActiveWorkout(db));
        setRoutines(await listRoutines(db));
        setRecent(await listWorkoutHistory(db, 5));
      })();
    }, [db]),
  );

  const reload = async () => {
    setActive(await getActiveWorkout(db));
    setRoutines(await listRoutines(db));
    setRecent(await listWorkoutHistory(db, 5));
  };

  const exportData = async () => {
    try {
      const data = await exportBackup(db);
      await shareJsonFile(backupFileName(Date.now()), JSON.stringify(data, null, 2));
    } catch (e) {
      Dialog.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  const importData = async () => {
    let file;
    try {
      const text = await pickTextFile();
      if (text == null) return;
      file = parseBackup(JSON.parse(text));
    } catch (e) {
      Dialog.alert('Can’t read that file', e instanceof Error ? e.message : String(e));
      return;
    }
    const times = file.workouts.map((w) => fromLocalIso(w.startedAt)!).sort((a, b) => a - b);
    const day = (ms: number) => `${formatDate(ms)} ${new Date(ms).getFullYear()}`;
    const range = times.length ? ` from ${day(times[0])} to ${day(times[times.length - 1])}` : '';
    const parked = file;
    Dialog.alert(
      'Import this file?',
      `${file.workouts.length} workouts${range}, ${file.exercises.length} exercises and ${file.routines?.length ?? 0} routines.\n\n` +
        'Only adds what’s missing: nothing on the phone is changed or deleted, and importing the same file again adds nothing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            try {
              const r = await importBackup(db, parked);
              await reload();
              Dialog.alert(
                'Import done',
                `Added ${r.workoutsAdded} workouts (${r.setsAdded} sets), ${r.exercisesAdded} new exercises and ${r.routinesAdded} routines.` +
                  (r.exercisesMatched ? ` ${r.exercisesMatched} exercises matched ones you already had.` : '') +
                  (r.workoutsSkipped ? ` ${r.workoutsSkipped} workouts were already here and were skipped.` : ''),
              );
            } catch (e) {
              Dialog.alert('Import failed', `Nothing was changed.\n\n${e instanceof Error ? e.message : String(e)}`);
            }
          },
        },
      ],
    );
  };

  const start = async (routineId: string | null) => {
    const id = await startWorkout(db, routineId);
    router.push(`/workout/${id}`);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}>
      {active ? (
        <Card style={{ borderColor: colors.accent, gap: space.md }}>
          <Text style={[font.small, { color: colors.accent, letterSpacing: 1 }]}>IN PROGRESS</Text>
          <Text style={font.h2}>{active.routine_name ?? 'Free workout'}</Text>
          <Text style={font.dim}>
            Started {formatTime(active.started_at)} · {formatDuration(active.started_at, Date.now())} ago
          </Text>
          <Button title="Resume workout" big onPress={() => router.push(`/workout/${active.id}`)} />
        </Card>
      ) : (
        <>
          <Text style={[font.h1, { marginBottom: space.sm }]}>Start a workout</Text>
          <Text style={[font.dim, { marginBottom: space.md }]}>Pick one of your routines.</Text>
          {routines.length === 0 ? (
            <Card style={{ gap: space.md }}>
              <Empty title="No routines yet" hint="Create one with the exercises you want to do together." />
              <Button title="Create a routine" onPress={() => router.push('/routines')} />
            </Card>
          ) : (
            <View style={{ gap: space.sm }}>
              {routines.map((r) => (
                <Card key={r.id} onPress={() => start(r.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={font.h2}>{r.name}</Text>
                      <Text style={font.dim}>
                        {r.exercise_count} exercise{r.exercise_count === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 16 }}>START ›</Text>
                  </View>
                </Card>
              ))}
            </View>
          )}
          <Button
            title="Empty workout"
            variant="secondary"
            style={{ marginTop: space.md }}
            onPress={() => start(null)}
          />
        </>
      )}

      {/* Past workouts are saved as finished, so this works even while one is in progress */}
      <Button
        title="Log a past workout"
        variant="ghost"
        style={{ marginTop: space.sm }}
        onPress={() => router.push('/workout/past')}
      />

      <SectionTitle>Recent workouts</SectionTitle>
      {recent.length === 0 ? (
        <Empty title="Nothing logged yet" />
      ) : (
        <View style={{ gap: space.sm }}>
          {recent.map((w) => (
            <Card key={w.id} onPress={() => router.push(`/workout/${w.id}`)}>
              <Text style={font.body}>{w.routine_name ?? 'Free workout'}</Text>
              <Text style={font.dim}>
                {formatDate(w.started_at)} · {w.exercise_count} exercises · {w.set_count} sets ·{' '}
                {formatVolume(w.volume)}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <SectionTitle>Backup</SectionTitle>
      <Text style={[font.small, { marginBottom: space.sm }]}>
        Save everything to a JSON file (Drive, Files…), or import one, e.g. an old export or converted history.
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Export" variant="secondary" onPress={exportData} style={{ flex: 1 }} />
        <Button title="Import" variant="secondary" onPress={importData} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}
