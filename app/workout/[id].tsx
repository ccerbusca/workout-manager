import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
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
  setExerciseLoadType,
  updateSet,
} from '../../src/db/repo';
import { UnitMenu, unitMenuHitTest, type UnitMenuState } from '../../src/components/UnitMenu';
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
import { radius, space, useTheme } from '../../src/theme';

export default function WorkoutScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const db = useSQLiteContext();
  const [workout, setWorkout] = useState<Workout | null | undefined>(undefined);
  // A finished workout opens as a read-only summary; "Edit" (or ?edit=1, used right after logging
  // a past workout) shows the logging screen for it instead
  const [editing, setEditing] = useState(edit === '1');
  const reload = () => getWorkout(db, id).then(setWorkout);

  useEffect(() => {
    getWorkout(db, id).then(setWorkout);
  }, [db, id]);

  if (workout === undefined) return <Loading />;
  if (workout === null) return <Empty title="Workout not found" />;

  return workout.ended_at && !editing ? (
    <WorkoutSummaryView workout={workout} onEdit={() => setEditing(true)} />
  ) : (
    <ActiveWorkout
      workout={workout}
      onFinished={reload}
      onDone={() => {
        setEditing(false);
        reload();
      }}
    />
  );
}

// ─────────────────────────── Active workout ───────────────────────────

/**
 * Logging screen. For a workout in progress it has a live timer and Finish/Discard. For a finished
 * workout (a past one being logged, or one being edited) it has a "Done" button instead.
 */
function ActiveWorkout({
  workout,
  onFinished,
  onDone,
}: {
  workout: Workout;
  onFinished: () => void;
  onDone: () => void;
}) {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const isFinished = workout.ended_at != null;
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [prev, setPrev] = useState<{ started_at: number; sets: WorkoutSet[] } | null>(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [, setTick] = useState(0);
  // Long-press kg/level menu. `origin` is the root view's page position, for placing the overlay.
  const [unitMenu, setUnitMenu] = useState<(UnitMenuState & { exerciseId: string }) | null>(null);
  const [unitHover, setUnitHover] = useState<LoadType | null>(null);
  const rootRef = useRef<View>(null);
  const chipRefs = useRef(new Map<string, View>());
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const { width: screenWidth } = useWindowDimensions();

  const selected = exercises.find((e) => e.exercise_id === selectedId);
  const loadType: LoadType = selected?.load_type ?? 'weight';

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

  // When the selected exercise (or its unit) changes, load its sets + last session, and prefill inputs
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      const [current, last] = await Promise.all([
        listSets(db, workout.id, selectedId),
        previousSets(db, selectedId, workout.id, workout.started_at),
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
  }, [db, workout.id, workout.started_at, selectedId, loadType]);

  /** Suggest the next set: repeat the last one done today, else match last session's equivalent set. */
  const prefill = (current: WorkoutSet[], last: WorkoutSet[]) => {
    // Only suggest from sets in the exercise's current unit (kg vs level)
    const cur = current.filter((s) => s.load_type === loadType);
    const prevSame = last.filter((s) => s.load_type === loadType);
    const ref = cur[cur.length - 1] ?? prevSame[cur.length] ?? prevSame[prevSame.length - 1];
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

  const openUnitMenu = (exerciseId: string, current: LoadType, e: GestureResponderEvent) => {
    setSelectedId(exerciseId);
    setUnitHover(null);
    const pageX = e.nativeEvent.pageX;
    // Open the menu just below the pressed chip, measured in the same page coordinates as touches
    chipRefs.current.get(exerciseId)?.measure((_x, _y, _w, h, _px, pageY) =>
      setUnitMenu({ exerciseId, current, x: pageX, y: pageY + h }),
    );
  };

  const pickUnit = async (lt: LoadType) => {
    const menu = unitMenu;
    setUnitMenu(null);
    setUnitHover(null);
    if (!menu || lt === menu.current) return;
    await setExerciseLoadType(db, menu.exerciseId, lt);
    await loadExercises(); // the new unit re-runs the load/prefill effect
  };

  // The long-press touch is still down when the menu opens: follow it so the user can slide onto an option
  const onChipsTouchMove = (e: GestureResponderEvent) => {
    if (!unitMenu) return;
    const hit = unitMenuHitTest(unitMenu, screenWidth, e.nativeEvent.pageX, e.nativeEvent.pageY);
    if (hit !== unitHover) setUnitHover(hit);
  };
  const onChipsTouchEnd = () => {
    if (unitMenu && unitHover) pickUnit(unitHover);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View
        ref={rootRef}
        style={{ flex: 1 }}
        onLayout={() => rootRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => setOrigin({ x: pageX, y: pageY }))}
      >
        <Stack.Screen
          options={{
            title: workout.routine_name ?? 'Free workout',
            headerRight: () =>
              isFinished ? (
                <Button title="Done" variant="ghost" onPress={onDone} />
              ) : (
                <Button title="Finish" variant="ghost" onPress={finish} />
              ),
          }}
        />
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!unitMenu} // otherwise sliding to an option scrolls the page and cancels the touch
        >
          <Text style={font.dim}>
            {isFinished
              ? `${formatDate(workout.started_at)} · ${formatTime(workout.started_at)} · ${formatDuration(workout.started_at, workout.ended_at ?? workout.started_at)}`
              : `Started ${formatTime(workout.started_at)} · ${formatDuration(workout.started_at, Date.now())}`}
          </Text>

          {/* Exercise chooser */}
          <SectionTitle>Exercise</SectionTitle>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}
            onTouchMove={onChipsTouchMove}
            onTouchEnd={onChipsTouchEnd}
          >
            {exercises.map((e) => {
              const isSel = e.exercise_id === selectedId;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => setSelectedId(e.exercise_id)}
                  ref={(v) => {
                    if (v) chipRefs.current.set(e.exercise_id, v);
                    else chipRefs.current.delete(e.exercise_id);
                  }}
                  onLongPress={(ev) => openUnitMenu(e.exercise_id, e.load_type, ev)}
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
                    {e.load_type === 'level' ? '  · L' : ''}
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
          {exercises.length > 0 ? (
            <Text style={[font.small, { marginTop: space.xs }]}>Long-press an exercise to switch kg / level</Text>
          ) : null}

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
                    {prev.sets.map((s) => formatSetShort(s.weight, s.reps, s.load_type)).join('   ')}
                  </Text>
                </Text>
              ) : (
                <Text style={font.small}>First time logging {selected.name}.</Text>
              )}

              {/* Logged sets */}
              <SectionTitle>{isFinished ? 'Sets' : 'Today'}</SectionTitle>
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
                          {formatLoad(s.weight, s.load_type)} × {s.reps}
                        </Text>
                        <Text style={font.small}>{isEditing
                            ? 'editing'
                            : // Sets added to a past workout were entered later, so their clock time means nothing
                              !isFinished || s.created_at <= (workout.ended_at ?? 0)
                              ? formatTime(s.created_at)
                              : ''}</Text>
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
            {isFinished ? (
              <Button title="Done" variant="secondary" onPress={onDone} />
            ) : (
              <>
                <Button title="Finish workout" variant="secondary" onPress={finish} />
                <Button title="Discard workout" variant="ghost" onPress={discard} />
              </>
            )}
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

        {unitMenu ? (
          <UnitMenu
            menu={unitMenu}
            origin={origin}
            screenWidth={screenWidth}
            hover={unitHover}
            onPick={pickUnit}
            onClose={() => {
              setUnitMenu(null);
              setUnitHover(null);
            }}
          />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────── Finished workout ───────────────────────────

function WorkoutSummaryView({ workout, onEdit }: { workout: Workout; onEdit: () => void }) {
  const { font } = useTheme();
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
      <Stack.Screen
        options={{ title: workout.routine_name ?? 'Free workout', headerRight: () => <Button title="Edit" variant="ghost" onPress={onEdit} /> }}
      />
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
                    {formatLoad(s.weight, s.load_type)} × {s.reps}
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
  const { font } = useTheme();
  return (
    <Card style={{ flex: 1, padding: space.md }}>
      <Text style={font.small}>{label.toUpperCase()}</Text>
      <Text style={[font.h2, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </Card>
  );
}
