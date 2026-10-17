import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  countWorkoutHistory,
  exerciseStats,
  listExerciseMuscleGroupLinks,
  listLoggedUnits,
  listTrainedExercises,
  listWorkoutHistory,
} from '../../src/db/repo';
import type { ExerciseSessionStats, LoadType, TrainedExercise, WorkoutSummary } from '../../src/db/types';
import { ExerciseDropdown } from '../../src/components/ExerciseDropdown';
import { LineChart, type ChartPoint } from '../../src/components/LineChart';
import { Button, Card, Empty, SectionTitle, Segmented } from '../../src/components/ui';
import { formatDate, formatLoad, formatShortDate, formatVolume } from '../../src/lib/format';
import { colors, font, radius, space } from '../../src/theme';

type Metric = 'e1rm' | 'top' | 'volume' | 'reps';

const WEIGHT_METRICS: { key: Metric; label: string; unit: string; help: string }[] = [
  { key: 'e1rm', label: 'Est. 1RM', unit: 'kg', help: 'Estimated one-rep max from your best set (Epley formula).' },
  { key: 'top', label: 'Top weight', unit: 'kg', help: 'Heaviest weight lifted for this exercise in the session.' },
  { key: 'volume', label: 'Volume', unit: 'kg', help: 'Total weight × reps across all sets in the session.' },
];

const LEVEL_METRICS: typeof WEIGHT_METRICS = [
  { key: 'top', label: 'Top level', unit: 'level', help: 'Highest machine level used in the session.' },
  { key: 'reps', label: 'Total reps', unit: 'reps', help: 'Total reps across all sets in the session.' },
];

/** How many rows the Sessions and Recent workouts previews show before "See all". */
const PREVIEW = 5;

export default function ProgressScreen() {
  const db = useSQLiteContext();
  const [exercises, setExercises] = useState<TrainedExercise[]>([]);
  const [groupsByExercise, setGroupsByExercise] = useState(new Map<string, string[]>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState<ExerciseSessionStats[]>([]);
  const [metric, setMetric] = useState<Metric>('e1rm');
  const [history, setHistory] = useState<WorkoutSummary[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  // Units this exercise has sets in, and which one the chart shows
  const [units, setUnits] = useState<LoadType[]>([]);
  const [loadType, setLoadType] = useState<LoadType>('weight');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const list = await listTrainedExercises(db);
        setExercises(list);
        setSelectedId((cur) => (cur && list.some((e) => e.id === cur) ? cur : list[0]?.id ?? null));
        const groups = new Map<string, string[]>();
        for (const l of await listExerciseMuscleGroupLinks(db)) groups.set(l.exercise_id, [...(groups.get(l.exercise_id) ?? []), l.name]);
        setGroupsByExercise(groups);
        setHistory(await listWorkoutHistory(db, PREVIEW));
        setHistoryCount(await countWorkoutHistory(db));
      })();
    }, [db]),
  );

  // Start on the exercise's current unit if it has sets in it, otherwise the unit it does have
  useEffect(() => {
    const current = exercises.find((e) => e.id === selectedId)?.load_type ?? 'weight';
    if (selectedId) {
      listLoggedUnits(db, selectedId).then((logged) => {
        setUnits(logged);
        setLoadType(logged.includes(current) || logged.length === 0 ? current : logged[0]);
      });
    } else {
      setUnits([]);
    }
  }, [db, selectedId, history, exercises]);

  // Chart only the sets logged in one unit at a time, so kg and levels never mix
  useEffect(() => {
    if (selectedId) exerciseStats(db, selectedId, loadType).then(setStats);
    else setStats([]);
  }, [db, selectedId, loadType, history]);

  const metrics = loadType === 'level' ? LEVEL_METRICS : WEIGHT_METRICS;
  const m = metrics.find((x) => x.key === metric) ?? metrics[0];
  const points: ChartPoint[] = stats.map((s) => ({
    x: s.started_at,
    y: m.key === 'e1rm' ? s.best_e1rm : m.key === 'top' ? s.top_weight : m.key === 'reps' ? s.total_reps : s.volume,
    label: formatShortDate(s.started_at),
  }));
  const recentSessions = stats.slice(-PREVIEW).reverse();

  if (exercises.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Empty title="No data yet" hint="Log a few workouts and your progress charts will show up here." />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}>
      <ExerciseDropdown
        exercises={exercises}
        groupsByExercise={groupsByExercise}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <Card style={{ marginTop: space.md, gap: space.md }}>
        {units.length > 1 ? (
          <Segmented
            options={[
              { value: 'weight', label: 'Weight (kg)' },
              { value: 'level', label: 'Machine level' },
            ]}
            value={loadType}
            onChange={setLoadType}
          />
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          {metrics.map((x) => (
            <Pressable
              key={x.key}
              onPress={() => setMetric(x.key)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: radius.sm,
                alignItems: 'center',
                backgroundColor: m.key === x.key ? colors.surfaceAlt : 'transparent',
              }}
            >
              <Text style={{ color: m.key === x.key ? colors.text : colors.textFaint, fontWeight: '700', fontSize: 13 }}>
                {x.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {points.length > 0 ? <LineChart points={points} unit={m.unit} /> : <Empty title="No sessions" />}
        <Text style={font.small}>{m.help}</Text>
      </Card>

      <SectionTitle>{units.length > 1 ? `Sessions (${loadType === 'level' ? 'levels' : 'kg'})` : 'Sessions'}</SectionTitle>
      <View>
        {recentSessions.map((s) => (
          <Pressable
            key={s.workout_id}
            onPress={() => router.push(`/workout/${s.workout_id}`)}
            style={{ flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <Text style={[font.dim, { flex: 1 }]}>{formatDate(s.started_at)}</Text>
            <Text style={[font.body, { fontVariant: ['tabular-nums'] }]}>
              {s.set_count} sets · top {formatLoad(s.top_weight, loadType)}
            </Text>
          </Pressable>
        ))}
      </View>
      {stats.length > PREVIEW && selectedId ? (
        <Button
          title={`See all ${stats.length} sessions`}
          variant="secondary"
          style={{ marginTop: space.md }}
          onPress={() => router.push({ pathname: '/history', params: { exerciseId: selectedId, unit: loadType } })}
        />
      ) : null}

      <SectionTitle>Recent workouts</SectionTitle>
      <View style={{ gap: space.sm }}>
        {history.map((w) => (
          <Card key={w.id} onPress={() => router.push(`/workout/${w.id}`)}>
            <Text style={font.body}>{w.routine_name ?? 'Free workout'}</Text>
            <Text style={font.dim}>
              {formatDate(w.started_at)} · {w.set_count} sets · {formatVolume(w.volume)}
            </Text>
          </Card>
        ))}
      </View>
      {historyCount > PREVIEW ? (
        <Button
          title={`See all ${historyCount} workouts`}
          variant="secondary"
          style={{ marginTop: space.md }}
          onPress={() => router.push('/history')}
        />
      ) : null}
    </ScrollView>
  );
}
