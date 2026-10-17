import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { addSet, deleteSet, getExercise, getWorkout, listSets, previousSets, updateSet } from '../../../src/db/repo';
import type { LoadType, Workout, WorkoutSet } from '../../../src/db/types';
import { Dialog } from '../../../src/components/Dialog';
import { RestTimerCard } from '../../../src/components/RestTimer';
import { Button, Card, Empty, Loading, SectionTitle, Stepper } from '../../../src/components/ui';
import { formatAgo, formatDate, formatLoad, formatTime, formatWeight, parseNumber } from '../../../src/lib/format';
import { prefs } from '../../../src/lib/prefs';
import { useRestTimer } from '../../../src/lib/restTimer';
import { radius, space, useTheme } from '../../../src/theme';

/**
 * Logging screen for one exercise in a workout: last time, today's sets, weight/reps steppers and
 * the rest timer. Opened from the workout overview; going back returns there.
 */
export default function ExerciseLogScreen() {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const rest = useRestTimer();
  const { workoutId, exerciseId } = useLocalSearchParams<{ workoutId: string; exerciseId: string }>();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exercise, setExercise] = useState<{ name: string; load_type: LoadType } | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [prev, setPrev] = useState<{ started_at: number; sets: WorkoutSet[] } | null>(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  const loadType: LoadType = exercise?.load_type ?? 'weight';
  const isFinished = workout?.ended_at != null;

  /** Suggest the next set: repeat the last one done today, else match last session's equivalent set. */
  const prefill = (current: WorkoutSet[], last: WorkoutSet[], unit: LoadType) => {
    // Only suggest from sets in the exercise's current unit (kg vs level)
    const cur = current.filter((s) => s.load_type === unit);
    const prevSame = last.filter((s) => s.load_type === unit);
    const ref = cur[cur.length - 1] ?? prevSame[cur.length] ?? prevSame[prevSame.length - 1];
    setWeight(ref ? formatWeight(ref.weight) : '');
    setReps(ref ? String(ref.reps) : '');
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [w, e] = await Promise.all([getWorkout(db, workoutId), getExercise(db, exerciseId)]);
        if (!w || !e || cancelled) return;
        const [current, last] = await Promise.all([
          listSets(db, workoutId, exerciseId),
          previousSets(db, exerciseId, workoutId, w.started_at),
        ]);
        if (cancelled) return;
        setWorkout(w);
        setExercise(e);
        setSets(current);
        setPrev(last);
        setEditingSetId(null);
        prefill(current, last?.sets ?? [], e.load_type);
      })();
      return () => {
        cancelled = true;
      };
    }, [db, workoutId, exerciseId]),
  );

  const refreshSets = async () => {
    const current = await listSets(db, workoutId, exerciseId);
    setSets(current);
    return current;
  };

  const logSet = async () => {
    const w = parseNumber(weight);
    const r = parseNumber(reps);
    if (w == null || r == null || r <= 0) {
      Dialog.alert('Check your numbers', 'Enter a weight or level (0 for bodyweight) and at least 1 rep.');
      return;
    }
    if (editingSetId) {
      await updateSet(db, editingSetId, w, Math.round(r));
      setEditingSetId(null);
    } else {
      await addSet(db, workoutId, exerciseId, w, Math.round(r));
      // Rest between sets; not when back-filling a past workout
      if (!isFinished && prefs.getRestAutoStart()) rest.start();
    }
    const current = await refreshSets();
    prefill(current, prev?.sets ?? [], loadType);
  };

  const onSetPress = (s: WorkoutSet) => {
    if (editingSetId === s.id) {
      setEditingSetId(null);
      prefill(sets, prev?.sets ?? [], loadType);
      return;
    }
    setEditingSetId(s.id);
    setWeight(formatWeight(s.weight));
    setReps(String(s.reps));
  };

  const onSetLongPress = (s: WorkoutSet) => {
    Dialog.alert(`Delete set ${s.set_index}?`, `${formatLoad(s.weight, s.load_type)} × ${s.reps}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSet(db, s.id);
          if (editingSetId === s.id) setEditingSetId(null);
          refreshSets();
        },
      },
    ]);
  };

  if (!workout || !exercise) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: exercise.name }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
        {!isFinished ? <RestTimerCard /> : null}

        <SectionTitle>{prev ? `Last time · ${formatDate(prev.started_at)} (${formatAgo(prev.started_at)})` : 'Last time'}</SectionTitle>
        {prev ? (
          <LastTimeTable sets={prev.sets} nextSet={editingSetId ? null : sets.length + 1} />
        ) : (
          <Text style={font.small}>First time logging {exercise.name}.</Text>
        )}

        <SectionTitle>{isFinished ? 'Sets' : 'Today'}</SectionTitle>
        {sets.length === 0 ? (
          <Empty title="No sets yet" />
        ) : (
          <View style={{ gap: space.xs }}>
            {sets.map((s) => {
              const isEditing = editingSetId === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => onSetPress(s)}
                  onLongPress={() => onSetLongPress(s)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: space.md,
                    borderRadius: radius.md,
                    backgroundColor: isEditing ? colors.surfaceAlt : colors.surface,
                    borderWidth: 1,
                    borderColor: isEditing ? colors.accent : colors.border,
                  }}
                >
                  <Text style={[font.dim, { width: 56 }]}>Set {s.set_index}</Text>
                  <Text style={[font.body, { flex: 1, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>
                    {formatLoad(s.weight, s.load_type)} × {s.reps}
                  </Text>
                  <Text style={font.small}>
                    {isEditing
                      ? 'editing'
                      : // Sets added to a past workout were entered later, so their clock time means nothing
                        !isFinished || s.created_at <= (workout.ended_at ?? 0)
                        ? formatTime(s.created_at)
                        : ''}
                  </Text>
                </Pressable>
              );
            })}
            <Text style={[font.small, { marginTop: space.xs }]}>Tap a set to edit · long-press to delete</Text>
          </View>
        )}

        <Card style={{ marginTop: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Stepper
              label={loadType === 'level' ? 'level' : 'kg'}
              value={weight}
              onChange={setWeight}
              step={loadType === 'level' ? 1 : 2.5}
              decimal={loadType !== 'level'}
            />
            <Stepper label="reps" value={reps} onChange={setReps} step={1} />
          </View>
          <Button title={editingSetId ? 'Update set' : `Log set ${sets.length + 1}`} big onPress={logSet} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Last session's sets as a table: Set | kg (or Level) | Reps. The row matching the set you're about
 * to log is highlighted so you can compare like with like. If last time mixed kg and levels, the
 * middle column shows each value with its unit.
 */
function LastTimeTable({ sets, nextSet }: { sets: WorkoutSet[]; nextSet: number | null }) {
  const { colors, font } = useTheme();
  const units = new Set(sets.map((s) => s.load_type));
  const single = units.size === 1 ? sets[0].load_type : null;
  const loadHeader = single === 'level' ? 'LEVEL' : single === 'weight' ? 'KG' : 'LOAD';
  const cell = { flex: 1, textAlign: 'center' as const, fontVariant: ['tabular-nums' as const] };

  return (
    <View style={{ borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', paddingVertical: 8, backgroundColor: colors.surfaceAlt }}>
        {['SET', loadHeader, 'REPS'].map((h) => (
          <Text key={h} style={[font.small, cell, { letterSpacing: 1, fontWeight: '700' }]}>
            {h}
          </Text>
        ))}
      </View>
      {sets.map((s, i) => {
        const isNext = nextSet === i + 1;
        return (
          <View
            key={s.id}
            style={{
              flexDirection: 'row',
              paddingVertical: 8,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: isNext ? colors.surfaceAlt : colors.surface,
            }}
          >
            <Text style={[font.dim, cell, isNext && { color: colors.accent, fontWeight: '800' }]}>{i + 1}</Text>
            <Text style={[font.body, cell, { fontWeight: '700' }]}>
              {single ? formatWeight(s.weight) : formatLoad(s.weight, s.load_type)}
            </Text>
            <Text style={[font.body, cell]}>{s.reps}</Text>
          </View>
        );
      })}
    </View>
  );
}
