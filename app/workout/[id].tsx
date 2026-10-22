import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import { Dialog } from '../../src/components/Dialog';
import { router, Stack, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useSQLiteContext } from 'expo-sqlite';
import {
  addExerciseToWorkout,
  deleteWorkout,
  finishWorkout,
  getWorkout,
  listAllSetsForWorkout,
  listWorkoutExercises,
  previousSets,
  arrangeWorkoutExercises,
  setExerciseLoadType,
} from '../../src/db/repo';
import { ElapsedTime } from '../../src/components/ElapsedTime';
import { RestTimerBar } from '../../src/components/RestTimer';
import { WorkoutNotes } from '../../src/components/WorkoutNotes';
import { describeHit, mainHit, recordsForWorkouts, type PrHit } from '../../src/lib/records';
import type { LoadType, Workout, WorkoutExercise, WorkoutSet } from '../../src/db/types';
import { ExercisePicker } from '../../src/components/ExercisePicker';
import { Button, Card, Empty, Loading, SectionTitle } from '../../src/components/ui';
import {
  formatDate,
  formatDuration,
  formatLoad,
  formatSessionSummary,
  formatTime,
  formatVolume,
} from '../../src/lib/format';
import { prefs } from '../../src/lib/prefs';
import { radius, space, useTheme } from '../../src/theme';
import { KeyboardScrollView } from '../../src/components/KeyboardScrollView';

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
    <WorkoutOverview
      workout={workout}
      onFinished={reload}
      onDone={() => {
        setEditing(false);
        reload();
      }}
    />
  );
}

// ─────────────────────────── Workout overview ───────────────────────────

interface OverviewRow extends WorkoutExercise {
  /** The most recent earlier workout with this exercise, and its sets. */
  last: { started_at: number; sets: WorkoutSet[] } | null;
}

/** The drag list: active exercises, the Finished divider, then finished exercises. */
type OverviewItem = ({ kind: 'exercise' } & OverviewRow) | { kind: 'divider'; id: string };
const DIVIDER: OverviewItem = { kind: 'divider', id: '__finished__' };

/**
 * The exercises in a workout. Each row shows sets done, last time, and a KG | LVL | BW switch;
 * tapping a row opens that exercise's logging screen (app/log/...). Holding a row picks it up to
 * reorder (react-native-sortables). Only this workout's order changes, never the routine's
 * (arrangeWorkoutExercises); the routine is reordered in the routine editor. For a workout in
 * progress it has a live timer, the rest bar and Finish/Discard, and going back asks whether to discard it. For a finished
 * workout (a past one being logged, or one being edited) it has a "Done" button instead.
 */
function WorkoutOverview({
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
  const navigation = useNavigation();
  const isFinished = workout.ended_at != null;
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // One drag list with the Finished divider in it: cards above it are active, cards below are
  // finished, so dragging a card across the divider finishes or un-finishes it. The divider has
  // no handle (customHandle), so it can't be picked up but moves as cards are dragged past it.
  const { items, doneCount } = useMemo(() => {
    const active = rows.filter((r) => r.finished_at == null);
    const done = rows.filter((r) => r.finished_at != null);
    const list: OverviewItem[] = rows.length
      ? [...active.map((r) => ({ kind: 'exercise' as const, ...r })), DIVIDER, ...done.map((r) => ({ kind: 'exercise' as const, ...r }))]
      : [];
    return { items: list, doneCount: done.length };
  }, [rows]);

  // Show the new arrangement immediately, then save it (this workout only; the routine is untouched)
  const onArrange = ({ data }: { data: OverviewItem[] }) => {
    const split = data.findIndex((i) => i.kind === 'divider');
    const t = Date.now();
    const next: OverviewRow[] = [];
    data.forEach((item, i) => {
      if (item.kind !== 'exercise') return;
      const { kind, ...row } = item;
      const isDone = i > split;
      next.push({ ...row, finished_at: isDone ? row.finished_at ?? t : null });
    });
    setRows(next);
    arrangeWorkoutExercises(
      db,
      workout.id,
      next.map((r) => r.id),
      next.filter((r) => r.finished_at != null).map((r) => r.id),
    );
  };

  const load = useCallback(async () => {
    const list = await listWorkoutExercises(db, workout.id);
    const withLast = await Promise.all(
      list.map(async (e) => ({
        ...e,
        last: await previousSets(db, e.exercise_id, workout.id, workout.started_at),
      })),
    );
    setRows(withLast);
  }, [db, workout.id, workout.started_at]);

  // Reload whenever we come back from an exercise screen (set counts change there)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Going back from a workout in progress asks first (system back, header arrow and gestures alike)
  usePreventRemove(!isFinished && !leaving, ({ data }) => {
    Dialog.alert('Leave this workout?', 'Pause it to pick it up later from the Train tab.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Pause', onPress: () => navigation.dispatch(data.action) },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(db, workout.id);
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  // Leaving on purpose (Discard button): lift the guard first, then go back once it has re-rendered
  useEffect(() => {
    if (leaving) router.back();
  }, [leaving]);

  const setUnit = async (exerciseId: string, lt: LoadType) => {
    await setExerciseLoadType(db, exerciseId, lt);
    load();
  };

  const openExercise = (exerciseId: string) => router.push(`/log/${workout.id}/${exerciseId}`);

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
          setLeaving(true);
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
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
      <KeyboardScrollView
        animatedRef={scrollRef}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2, gap: space.sm }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[font.dim, { marginBottom: space.xs }]}>
          {isFinished ? (
            `${formatDate(workout.started_at)} · ${formatTime(workout.started_at)} · ${formatDuration(workout.started_at, workout.ended_at ?? workout.started_at)}`
          ) : (
            <>
              Started {formatTime(workout.started_at)} · <ElapsedTime startedAt={workout.started_at} />
            </>
          )}
        </Text>

        {!isFinished ? <RestTimerBar /> : null}

        {rows.length === 0 ? <Empty title="No exercises yet" hint="Add one to start logging." /> : null}
        <Sortable.Grid
          columns={1}
          rowGap={space.sm}
          data={items}
          keyExtractor={(i) => i.id}
          scrollableRef={scrollRef}
          customHandle
          // Hold to pick up; a quick tap still opens the exercise
          dragActivationDelay={300}
          onDragEnd={onArrange}
          renderItem={({ item }) =>
            item.kind === 'divider' ? (
              <FinishedDivider count={doneCount} />
            ) : (
              <Sortable.Handle>
                <ExerciseCard
                  row={item}
                  finished={item.finished_at != null}
                  onOpen={() => openExercise(item.exercise_id)}
                  onUnit={(lt) => setUnit(item.exercise_id, lt)}
                />
              </Sortable.Handle>
            )
          }
        />
        {rows.length > 1 ? <Text style={[font.small, { textAlign: 'center' }]}>Hold an exercise to reorder it</Text> : null}

        <Pressable
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => ({
            paddingVertical: space.md,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.textFaint,
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: colors.textDim, fontWeight: '700' }}>+ Add exercise</Text>
        </Pressable>

        <View style={{ marginTop: space.md }}>
          <WorkoutNotes workoutId={workout.id} initial={workout.notes} />
        </View>

        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {isFinished ? (
            <Button title="Done" variant="secondary" onPress={onDone} />
          ) : (
            <>
              <Button title="Finish workout" onPress={finish} />
              <Button title="Discard workout" variant="ghost" onPress={discard} />
            </>
          )}
        </View>
      </KeyboardScrollView>

      <ExercisePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        excludeIds={rows.map((e) => e.exercise_id)}
        onPick={async (e) => {
          setPickerOpen(false);
          await addExerciseToWorkout(db, workout.id, e.id);
          openExercise(e.id);
        }}
      />
    </View>
  );
}

/** One exercise on the workout overview. Finished ones are dimmed but work the same. */
function ExerciseCard(props: { row: OverviewRow; finished: boolean; onOpen: () => void; onUnit: (lt: LoadType) => void }) {
  const { colors, font } = useTheme();
  const { row: e, finished } = props;
  const tint = finished ? colors.textDim : colors.accent;
  return (
    <Pressable
      onPress={props.onOpen}
      style={({ pressed }) => ({
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: e.set_count > 0 && !finished ? colors.accent : colors.border,
        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        gap: space.xs,
        opacity: finished ? 0.75 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text style={[font.h2, { flex: 1, fontSize: 18 }, finished && { color: colors.textDim }]} numberOfLines={1}>
          {e.name}
        </Text>
        {e.set_count > 0 ? (
          <Text style={{ color: tint, fontWeight: '800', fontVariant: ['tabular-nums'] }}>✓{e.set_count}</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {/* Shrinks a little on narrow screens instead of wrapping, so the card stays two lines tall */}
        <Text style={[font.dim, { flex: 1, fontSize: 13 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {e.last?.sets.length ? `Last: ${formatSessionSummary(e.last.started_at, e.last.sets, e.load_type)}` : 'First time'}
        </Text>
        <UnitToggle value={e.load_type} onChange={props.onUnit} />
        <Text style={{ color: colors.textFaint, fontSize: 22, marginTop: -2 }}>›</Text>
      </View>
    </Pressable>
  );
}

/** "FINISHED · 2" between active and finished exercises; with none yet, says how cards get there. */
function FinishedDivider({ count }: { count: number }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ paddingTop: space.md, paddingBottom: space.xs, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text style={[font.small, { letterSpacing: 1, fontWeight: '700' }]}>FINISHED{count ? ` · ${count}` : ''}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>
      {count === 0 ? (
        <Text style={[font.small, { textAlign: 'center' }]}>Tap Finish exercise, or drag an exercise below this line</Text>
      ) : null}
    </View>
  );
}

/** Compact KG | LVL | BW switch for an exercise row. Sets keep the unit they were logged in. */
function UnitToggle(props: { value: LoadType; onChange: (v: LoadType) => void }) {
  const { colors } = useTheme();
  const options: { value: LoadType; label: string }[] = [
    { value: 'weight', label: 'KG' },
    { value: 'level', label: 'LVL' },
    { value: 'bodyweight', label: 'BW' },
  ];
  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceAlt,
        padding: 2,
      }}
    >
      {options.map((o) => {
        const active = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => !active && props.onChange(o.value)}
            hitSlop={6}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: radius.sm - 2,
              backgroundColor: active ? colors.accent : 'transparent',
            }}
          >
            <Text style={{ color: active ? colors.accentText : colors.textDim, fontWeight: '800', fontSize: 12 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─────────────────────────── Finished workout ───────────────────────────

function WorkoutSummaryView({ workout, onEdit }: { workout: Workout; onEdit: () => void }) {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [rows, setRows] = useState<(WorkoutSet & { name: string })[] | null>(null);
  // Sets that were personal records when this workout was done
  const [records, setRecords] = useState(new Map<string, PrHit[]>());

  useEffect(() => {
    listAllSetsForWorkout(db, workout.id).then(setRows);
    recordsForWorkouts(db, [workout.id]).then(setRecords);
  }, [db, workout.id]);

  if (!rows) return <Loading />;

  // Group sets by exercise, preserving the order they were first done
  const byExercise = new Map<string, { name: string; sets: WorkoutSet[] }>();
  for (const r of rows) {
    const g = byExercise.get(r.exercise_id) ?? { name: r.name, sets: [] };
    g.sets.push(r);
    byExercise.set(r.exercise_id, g);
  }
  // Same rule as SET_VOLUME in repo.ts: bodyweight sets count only once the bodyweight is set
  const bodyweight = prefs.getBodyweight();
  const volume = rows.reduce(
    (sum, r) =>
      sum +
      (r.load_type === 'weight' ? r.weight * r.reps : r.load_type === 'bodyweight' && bodyweight > 0 ? Math.max(bodyweight + r.weight, 0) * r.reps : 0),
    0,
  );

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
    <KeyboardScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{ title: workout.routine_name ?? 'Free workout', headerRight: () => <Button title="Edit" variant="ghost" onPress={onEdit} /> }}
      />
      <Text style={font.h1}>{formatDate(workout.started_at)}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <Stat label="Duration" value={formatDuration(workout.started_at, workout.ended_at ?? workout.started_at)} />
        <Stat label="Sets" value={String(rows.length)} />
        <Stat label="Volume" value={formatVolume(volume)} />
        {records.size > 0 ? <Stat label="PRs" value={`🏆 ${records.size}`} /> : null}
      </View>

      {byExercise.size === 0 ? (
        <Empty title="No sets were logged" />
      ) : (
        [...byExercise.entries()].map(([exId, g]) => (
          <View key={exId}>
            <SectionTitle>{g.name}</SectionTitle>
            <Card style={{ gap: space.xs }}>
              {g.sets.map((s) => {
                const hits = records.get(s.id);
                return (
                  <View key={s.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[font.dim, { width: 56 }]}>Set {s.set_index}</Text>
                      <Text style={[font.body, { flex: 1, fontVariant: ['tabular-nums'] }]}>
                        {formatLoad(s.weight, s.load_type)} × {s.reps}
                      </Text>
                      {hits ? <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>🏆 PR</Text> : null}
                    </View>
                    {hits ? (
                      <Text style={[font.small, { marginLeft: 56, marginBottom: 2 }]}>{describeHit(mainHit(hits))}</Text>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </View>
        ))
      )}

      <View style={{ marginTop: space.xl }}>
        <WorkoutNotes workoutId={workout.id} initial={workout.notes} />
      </View>

      <Button title="Delete workout" variant="danger" onPress={remove} style={{ marginTop: space.xl }} />
    </KeyboardScrollView>
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
