import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, Vibration, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  finishWorkoutExercise,
  addSet,
  deleteSet,
  getExercise,
  getWorkout,
  listExerciseSetHistory,
  listSets,
  previousSets,
  updateSet,
} from '../../../src/db/repo';
import type { LoadType, SetHistoryRow, Workout, WorkoutSet } from '../../../src/db/types';
import { Dialog } from '../../../src/components/Dialog';
import { RestTimerCard } from '../../../src/components/RestTimer';
import { Button, Card, Empty, Loading, SectionTitle, Stepper } from '../../../src/components/ui';
import { formatAgo, formatDate, formatLoad, formatTime, formatWeight, parseNumber } from '../../../src/lib/format';
import { prefs } from '../../../src/lib/prefs';
import { describeHit, findRecords, mainHit, type PrHit } from '../../../src/lib/records';
import { useRestTimer } from '../../../src/lib/restTimer';
import { DEFAULT_STEP, inferStepFromHistory } from '../../../src/lib/stepSize';
import { radius, space, useTheme } from '../../../src/theme';
import { KeyboardScrollView } from '../../../src/components/KeyboardScrollView';

/**
 * Logging screen for one exercise in a workout: last time, today's sets, weight/reps steppers and
 * the rest timer. Opened from the workout overview; "Finish exercise" (or back) returns there.
 * Every set is saved the moment it's logged, so leaving never needs confirming.
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
  // Personal records among this workout's sets (worked out from the exercise's whole history)
  const [records, setRecords] = useState(new Map<string, PrHit[]>());
  // The exercise's whole set history (also used for the stepper increment); refreshed with records
  const [history, setHistory] = useState<SetHistoryRow[]>([]);
  // "New PR" banner after logging a record set; hides itself after a few seconds
  const [banner, setBanner] = useState<string[] | null>(null);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  /** Recomputes which of this workout's sets are records (after any add, edit or delete). */
  const loadRecords = useCallback(async () => {
    const hist = await listExerciseSetHistory(db, exerciseId);
    setHistory(hist);
    const all = findRecords(hist);
    const mine = new Map<string, PrHit[]>();
    for (const s of await listSets(db, workoutId, exerciseId)) {
      const hits = all.get(s.id);
      if (hits) mine.set(s.id, hits);
    }
    setRecords(mine);
    return mine;
  }, [db, workoutId, exerciseId]);

  const loadType: LoadType = exercise?.load_type ?? 'weight';
  const isFinished = workout?.ended_at != null;
  // Stepper increment learnt from recent weights (machines step 2, 2.5, 3, 7 kg…); see lib/stepSize
  const { step: weightStep, learnt: stepLearnt } = history.length
    ? inferStepFromHistory(history, loadType)
    : { step: DEFAULT_STEP[loadType], learnt: false };

  /** Suggest the next set: repeat the last one done today, else match last session's equivalent set. */
  const prefill = (current: WorkoutSet[], last: WorkoutSet[], unit: LoadType) => {
    // Only suggest from sets in the exercise's current unit (kg vs level)
    const cur = current.filter((s) => s.load_type === unit);
    const prevSame = last.filter((s) => s.load_type === unit);
    const ref = cur[cur.length - 1] ?? prevSame[cur.length] ?? prevSame[prevSame.length - 1];
    // Bodyweight starts at 0 added kg rather than an empty field
    setWeight(ref ? formatWeight(ref.weight) : unit === 'bodyweight' ? '0' : '');
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
        loadRecords();
      })();
      return () => {
        cancelled = true;
      };
    }, [db, workoutId, exerciseId, loadRecords]),
  );

  const refreshSets = async () => {
    const current = await listSets(db, workoutId, exerciseId);
    setSets(current);
    return current;
  };

  const logSet = async () => {
    const w = parseNumber(weight);
    const r = parseNumber(reps);
    if (w == null || r == null || r <= 0 || (w < 0 && loadType !== 'bodyweight')) {
      Dialog.alert(
        'Check your numbers',
        `Enter ${
          loadType === 'level' ? 'a level'
          : loadType === 'bodyweight' ? 'the added weight (0 for none, negative for machine assistance)'
          : 'a weight'
        } and at least 1 rep.`,
      );
      return;
    }
    let newSetId: string | null = null;
    if (editingSetId) {
      await updateSet(db, editingSetId, w, Math.round(r));
      setEditingSetId(null);
    } else {
      newSetId = await addSet(db, workoutId, exerciseId, w, Math.round(r));
      // Rest between sets; not when back-filling a past workout
      if (!isFinished && prefs.getRestAutoStart()) rest.start();
    }
    const current = await refreshSets();
    prefill(current, prev?.sets ?? [], loadType);
    const recs = await loadRecords();
    // Celebrate a record set just logged (not edits, and not when back-filling a past workout)
    const hits = newSetId ? recs.get(newSetId) : undefined;
    if (hits && !isFinished) {
      const main = mainHit(hits);
      setBanner([describeHit(main), ...hits.filter((h) => h !== main).map(describeHit)]);
      Vibration.vibrate([0, 60, 80, 60]);
    }
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
          await refreshSets();
          loadRecords();
        },
      },
    ]);
  };

  if (!workout || !exercise) return <Loading />;

  return (
    <>
      <Stack.Screen options={{ title: exercise.name }} />
      <KeyboardScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
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
                  {records.has(s.id) ? (
                    <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12, marginRight: space.sm }}>🏆 PR</Text>
                  ) : null}
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

        {banner ? (
          <Animated.View
            entering={FadeInDown.duration(250)}
            exiting={FadeOut.duration(300)}
            style={{
              marginTop: space.lg,
              padding: space.md,
              borderRadius: radius.lg,
              backgroundColor: colors.accent,
              gap: 2,
            }}
          >
            <Text style={{ color: colors.accentText, fontWeight: '900', letterSpacing: 1 }}>🏆 NEW PR</Text>
            {banner.map((line) => (
              <Text key={line} style={{ color: colors.accentText, fontWeight: '600' }}>
                {line}
              </Text>
            ))}
          </Animated.View>
        ) : null}

        <Card style={{ marginTop: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Stepper
              label={
                (loadType === 'level' ? 'level'
                : loadType === 'bodyweight' ? ((parseNumber(weight) ?? 0) < 0 ? 'assist kg (−)' : 'added kg')
                : 'kg') + (stepLearnt ? ` · ±${formatWeight(weightStep)}` : '')
              }
              value={weight}
              onChange={setWeight}
              step={weightStep}
              decimal={loadType !== 'level'}
              allowNegative={loadType === 'bodyweight'}
            />
            <Stepper label="reps" value={reps} onChange={setReps} step={1} />
          </View>
          <Button title={editingSetId ? 'Update set' : `Log set ${sets.length + 1}`} big onPress={logSet} />
        </Card>

        {/* Sets are saved as you log them; this makes "done with this exercise" an explicit step, and
            moves its card into Finished on the workout overview (going back without it doesn't) */}
        <Button
          title={isFinished ? 'Done' : 'Finish exercise'}
          variant="secondary"
          style={{ marginTop: space.md }}
          onPress={async () => {
            if (!isFinished) await finishWorkoutExercise(db, workoutId, exerciseId);
            router.back();
          }}
        />
      </KeyboardScrollView>
    </>
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
  // Bodyweight cells read "BW" / "BW +10 kg", so they keep the unit like a mixed session does
  const plain = single === 'weight' || single === 'level';
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
              {plain ? formatWeight(s.weight) : formatLoad(s.weight, s.load_type)}
            </Text>
            <Text style={[font.body, cell]}>{s.reps}</Text>
          </View>
        );
      })}
    </View>
  );
}
