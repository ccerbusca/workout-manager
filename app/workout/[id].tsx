import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Dialog } from '../../src/components/Dialog';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  addExerciseToWorkout,
  addSet,
  deleteSet,
  deleteWorkout,
  finishWorkout,
  getWorkout,
  listAllSetsForWorkout,
  listSets,
  listWorkoutExercises,
  previousSets,
  updateSet,
} from '../../src/db/repo';
import type { LoadType, Workout, WorkoutExercise, WorkoutSet } from '../../src/db/types';
import { ExercisePicker } from '../../src/components/ExercisePicker';
import { Button, Card, Empty, Loading, SectionTitle, Stepper } from '../../src/components/ui';
import {
  formatDate,
  formatDuration,
  formatLoad,
  formatSetShort,
  formatTime,
  formatVolume,
  formatWeight,
  parseNumber,
} from '../../src/lib/format';
import { colors, font, radius, space } from '../../src/theme';

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [workout, setWorkout] = useState<Workout | null | undefined>(undefined);

  useEffect(() => {
    getWorkout(db, id).then(setWorkout);
  }, [db, id]);

  if (workout === undefined) return <Loading />;
  if (workout === null) return <Empty title="Workout not found" />;

  return workout.ended_at ? (
    <WorkoutSummaryView workout={workout} />
  ) : (
    <ActiveWorkout workout={workout} onFinished={() => getWorkout(db, id).then(setWorkout)} />
  );
}

// ─────────────────────────── Active workout ───────────────────────────

function ActiveWorkout({ workout, onFinished }: { workout: Workout; onFinished: () => void }) {
  const db = useSQLiteContext();
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [prev, setPrev] = useState<{ started_at: number; sets: WorkoutSet[] } | null>(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [, setTick] = useState(0);

  // Re-render every 30 s so the elapsed time stays fresh
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadExercises = useCallback(async () => {
    const list = await listWorkoutExercises(db, workout.id);
    setExercises(list);
    return list;
  }, [db, workout.id]);

  // Load the exercise list once; auto-select the first exercise
  useEffect(() => {
    loadExercises().then((list) => {
      if (list.length > 0) setSelectedId((cur) => cur ?? list[0].exercise_id);
    });
  }, [loadExercises]);

  // When the selected exercise changes, load its sets + last session, and prefill inputs
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      const [current, last] = await Promise.all([
        listSets(db, workout.id, selectedId),
        previousSets(db, selectedId, workout.id),
      ]);
      if (cancelled) return;
      setSets(current);
      setPrev(last);
      setEditingSetId(null);
      prefill(current, last?.sets ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, workout.id, selectedId]);

  /** Suggest the next set: repeat the last one done today, else match last session's equivalent set. */
  const prefill = (current: WorkoutSet[], last: WorkoutSet[]) => {
    const ref = current[current.length - 1] ?? last[current.length] ?? last[last.length - 1];
    setWeight(ref ? formatWeight(ref.weight) : '');
    setReps(ref ? String(ref.reps) : '');
  };

  const refreshSets = async () => {
    if (!selectedId) return;
    const current = await listSets(db, workout.id, selectedId);
    setSets(current);
    loadExercises();
    return current;
  };

  const logSet = async () => {
    if (!selectedId) return;
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
      await addSet(db, workout.id, selectedId, w, Math.round(r));
    }
    const current = await refreshSets();
    if (current) prefill(current, prev?.sets ?? []);
  };

  const onSetPress = (s: WorkoutSet) => {
    if (editingSetId === s.id) {
      setEditingSetId(null);
      prefill(sets, prev?.sets ?? []);
      return;
    }
    setEditingSetId(s.id);
    setWeight(formatWeight(s.weight));
    setReps(String(s.reps));
  };

  const onSetLongPress = (s: WorkoutSet) => {
    Dialog.alert(`Delete set ${s.set_index}?`, `${formatLoad(s.weight, loadType)} × ${s.reps}`, [
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

  const finish = () => {
    Dialog.alert('Finish workout?', undefined, [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Finish',
        onPress: async () => {
          await finishWorkout(db, workout.id);
          onFinished();
        },
      },
    ]);
  };

  const discard = () => {
    Dialog.alert('Discard workout?', 'All sets logged in this workout will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(db, workout.id);
          router.back();
        },
      },
    ]);
  };

  const selected = exercises.find((e) => e.exercise_id === selectedId);
  const loadType: LoadType = selected?.load_type ?? 'weight';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: workout.routine_name ?? 'Free workout',
          headerRight: () => <Button title="Finish" variant="ghost" onPress={finish} />,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
        <Text style={font.dim}>
          Started {formatTime(workout.started_at)} · {formatDuration(workout.started_at, Date.now())}
        </Text>

        {/* Exercise chooser */}
        <SectionTitle>Exercise</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {exercises.map((e) => {
            const isSel = e.exercise_id === selectedId;
            return (
              <Pressable
                key={e.id}
                onPress={() => setSelectedId(e.exercise_id)}
                style={{
                  paddingHorizontal: space.md,
                  paddingVertical: 10,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: isSel ? colors.accent : colors.border,
                  backgroundColor: isSel ? colors.accent : e.set_count > 0 ? colors.surfaceAlt : colors.surface,
                }}
              >
                <Text style={{ color: isSel ? colors.accentText : colors.text, fontWeight: '600' }}>
                  {e.name}
                  {e.set_count > 0 ? `  ✓${e.set_count}` : ''}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={{
              paddingHorizontal: space.md,
              paddingVertical: 10,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.textFaint,
            }}
          >
            <Text style={{ color: colors.textDim, fontWeight: '600' }}>+ Add</Text>
          </Pressable>
        </View>

        {!selected ? (
          <Empty title="Add an exercise to start logging" />
        ) : (
          <>
            {/* Previous session */}
            <SectionTitle>Last time</SectionTitle>
            {prev ? (
              <Text style={font.dim}>
                {formatDate(prev.started_at)}:{'  '}
                <Text style={{ color: colors.text }}>
                  {prev.sets.map((s) => formatSetShort(s.weight, s.reps, loadType)).join('   ')}
                </Text>
              </Text>
            ) : (
              <Text style={font.small}>First time logging {selected.name}.</Text>
            )}

            {/* Logged sets */}
            <SectionTitle>Today</SectionTitle>
            {sets.length === 0 ? (
              <Text style={font.small}>No sets yet.</Text>
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
                        {formatLoad(s.weight, loadType)} × {s.reps}
                      </Text>
                      <Text style={font.small}>{isEditing ? 'editing' : formatTime(s.created_at)}</Text>
                    </Pressable>
                  );
                })}
                <Text style={[font.small, { marginTop: space.xs }]}>Tap a set to edit · long-press to delete</Text>
              </View>
            )}

            {/* Input */}
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
              <Button
                title={editingSetId ? 'Update set' : `Log set ${sets.length + 1}`}
                big
                onPress={logSet}
              />
            </Card>
          </>
        )}

        <View style={{ gap: space.sm, marginTop: space.xl }}>
          <Button title="Finish workout" variant="secondary" onPress={finish} />
          <Button title="Discard workout" variant="ghost" onPress={discard} />
        </View>
      </ScrollView>

      <ExercisePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        excludeIds={exercises.map((e) => e.exercise_id)}
        onPick={async (e) => {
          setPickerOpen(false);
          await addExerciseToWorkout(db, workout.id, e.id);
          await loadExercises();
          setSelectedId(e.id);
        }}
      />
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────── Finished workout ───────────────────────────

function WorkoutSummaryView({ workout }: { workout: Workout }) {
  const db = useSQLiteContext();
  const [rows, setRows] = useState<(WorkoutSet & { name: string; load_type: LoadType })[] | null>(null);

  useEffect(() => {
    listAllSetsForWorkout(db, workout.id).then(setRows);
  }, [db, workout.id]);

  if (!rows) return <Loading />;

  // Group sets by exercise, preserving the order they were first done
  const byExercise = new Map<string, { name: string; load_type: LoadType; sets: WorkoutSet[] }>();
  for (const r of rows) {
    const g = byExercise.get(r.exercise_id) ?? { name: r.name, load_type: r.load_type, sets: [] };
    g.sets.push(r);
    byExercise.set(r.exercise_id, g);
  }
  const volume = rows.reduce((sum, r) => sum + (r.load_type === 'weight' ? r.weight * r.reps : 0), 0);

  const remove = () => {
    Dialog.alert('Delete this workout?', 'It will be removed from your history and charts.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(db, workout.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}>
      <Stack.Screen options={{ title: workout.routine_name ?? 'Free workout', headerRight: () => null }} />
      <Text style={font.h1}>{formatDate(workout.started_at)}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <Stat label="Duration" value={formatDuration(workout.started_at, workout.ended_at ?? workout.started_at)} />
        <Stat label="Sets" value={String(rows.length)} />
        <Stat label="Volume" value={formatVolume(volume)} />
      </View>

      {byExercise.size === 0 ? (
        <Empty title="No sets were logged" />
      ) : (
        [...byExercise.entries()].map(([exId, g]) => (
          <View key={exId}>
            <SectionTitle>{g.name}</SectionTitle>
            <Card style={{ gap: space.xs }}>
              {g.sets.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row' }}>
                  <Text style={[font.dim, { width: 56 }]}>Set {s.set_index}</Text>
                  <Text style={[font.body, { fontVariant: ['tabular-nums'] }]}>
                    {formatLoad(s.weight, g.load_type)} × {s.reps}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        ))
      )}

      <Button title="Delete workout" variant="danger" onPress={remove} style={{ marginTop: space.xl }} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, padding: space.md }}>
      <Text style={font.small}>{label.toUpperCase()}</Text>
      <Text style={[font.h2, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </Card>
  );
}
