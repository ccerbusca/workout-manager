import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import { getActiveWorkout, listRoutines, listWorkoutHistory, reorderRoutines, startWorkout } from '../../src/db/repo';
import { DragHandle } from '../../src/components/DragHandle';
import type { Routine, Workout, WorkoutSummary } from '../../src/db/types';
import { Button, Card, Empty, SectionTitle } from '../../src/components/ui';
import { formatDate, formatDuration, formatTime, formatVolume } from '../../src/lib/format';
import { space, useTheme } from '../../src/theme';

export default function TrainScreen() {
  const { colors, font } = useTheme();
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
              <Text style={font.body}>{w.routine_name ?? 'Free workout'}</Text>
              <Text style={font.dim}>
                {formatDate(w.started_at)} · {w.exercise_count} exercises · {w.set_count} sets ·{' '}
                {formatVolume(w.volume)}
              </Text>
            </Card>
          ))}
        </View>
      )}
    </Animated.ScrollView>
  );
}
