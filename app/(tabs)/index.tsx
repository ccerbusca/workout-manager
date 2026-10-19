import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import {
  countWorkoutHistory,
  getActiveWorkout,
  listRoutines,
  listWorkoutHistory,
  reorderRoutines,
  startWorkout,
} from '../../src/db/repo';
import { DragHandle } from '../../src/components/DragHandle';
import { ElapsedTime } from '../../src/components/ElapsedTime';
import { countRecordsByWorkout } from '../../src/lib/records';
import type { Routine, Workout, WorkoutSummary } from '../../src/db/types';
import { Button, Card, Empty, SectionTitle } from '../../src/components/ui';
import { formatDate, formatTime, formatVolume, notePreview } from '../../src/lib/format';
import { prefs } from '../../src/lib/prefs';
import { space, useTheme } from '../../src/theme';

export default function TrainScreen() {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [active, setActive] = useState<Workout | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [recent, setRecent] = useState<WorkoutSummary[]>([]);
  // Record-setting sets per recent workout (shown as 🏆 N)
  const [prCounts, setPrCounts] = useState(new Map<string, number>());
  const [workoutCount, setWorkoutCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setActive(await getActiveWorkout(db));
        setRoutines(await listRoutines(db));
        const last = await listWorkoutHistory(db, 5, prefs.getBodyweight());
        setRecent(last);
        setPrCounts(await countRecordsByWorkout(db, last.map((w) => w.id)));
        setWorkoutCount(await countWorkoutHistory(db));
      })();
    }, [db]),
  );

  // Drag and drop: show the new order immediately, then save it
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const onReorder = ({ data }: { data: Routine[] }) => {
    setRoutines(data);
    reorderRoutines(db, data.map((r) => r.id));
  };

  const start = async (routineId: string | null) => {
    const id = await startWorkout(db, routineId);
    router.push(`/workout/${id}`);
  };

  return (
    <Animated.ScrollView ref={scrollRef} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}>
      {active ? (
        <Card style={{ borderColor: colors.accent, gap: space.md }}>
          <Text style={[font.small, { color: colors.accent, letterSpacing: 1 }]}>IN PROGRESS</Text>
          <Text style={font.h2}>{active.routine_name ?? 'Free workout'}</Text>
          <Text style={font.dim}>
            Started {formatTime(active.started_at)} · <ElapsedTime startedAt={active.started_at} suffix=" ago" />
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
            <Sortable.Grid
              columns={1}
              rowGap={space.sm}
              data={routines}
              keyExtractor={(r) => r.id}
              customHandle
              scrollableRef={scrollRef}
              onDragEnd={onReorder}
              renderItem={({ item: r }) => (
                <Card onPress={() => start(r.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <View style={{ flex: 1 }}>
                      <Text style={font.h2}>{r.name}</Text>
                      <Text style={font.dim}>
                        {r.exercise_count} exercise{r.exercise_count === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 16 }}>START ›</Text>
                    <DragHandle />
                  </View>
                </Card>
              )}
            />
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[font.body, { flex: 1 }]}>{w.routine_name ?? 'Free workout'}</Text>
                {prCounts.get(w.id) ? (
                  <Text style={{ color: colors.accent, fontWeight: '800' }}>🏆 {prCounts.get(w.id)}</Text>
                ) : null}
              </View>
              <Text style={font.dim}>
                {formatDate(w.started_at)} · {w.exercise_count} exercises · {w.set_count} sets ·{' '}
                {formatVolume(w.volume)}
              </Text>
              {notePreview(w.notes) ? (
                <Text style={[font.small, { marginTop: 2 }]} numberOfLines={1}>
                  {notePreview(w.notes)}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}
      {workoutCount > recent.length ? (
        <Button
          title={`See all ${workoutCount} workouts`}
          variant="secondary"
          style={{ marginTop: space.md }}
          onPress={() => router.push('/history')}
        />
      ) : null}
    </Animated.ScrollView>
  );
}
