import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { exerciseStats, listTrainedExercises, listWorkoutHistory } from '../../src/db/repo';
import type { Exercise, ExerciseSessionStats, WorkoutSummary } from '../../src/db/types';
import { LineChart, type ChartPoint } from '../../src/components/LineChart';
import { Card, Empty, SectionTitle } from '../../src/components/ui';
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

export default function ProgressScreen() {
  const db = useSQLiteContext();
  const [exercises, setExercises] = useState<(Exercise & { session_count: number })[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stats, setStats] = useState<ExerciseSessionStats[]>([]);
  const [metric, setMetric] = useState<Metric>('e1rm');
  const [history, setHistory] = useState<WorkoutSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const list = await listTrainedExercises(db);
        setExercises(list);
        setSelectedId((cur) => (cur && list.some((e) => e.id === cur) ? cur : list[0]?.id ?? null));
        setHistory(await listWorkoutHistory(db, 30));
      })();
    }, [db]),
  );

  useEffect(() => {
    if (selectedId) exerciseStats(db, selectedId).then(setStats);
    else setStats([]);
  }, [db, selectedId, history]);

  const selectedExercise = exercises.find((e) => e.id === selectedId);
  const loadType = selectedExercise?.load_type ?? 'weight';
  const metrics = loadType === 'level' ? LEVEL_METRICS : WEIGHT_METRICS;
  const m = metrics.find((x) => x.key === metric) ?? metrics[0];
  const points: ChartPoint[] = stats.map((s) => ({
    x: s.started_at,
    y: m.key === 'e1rm' ? s.best_e1rm : m.key === 'top' ? s.top_weight : m.key === 'reps' ? s.total_reps : s.volume,
    label: formatShortDate(s.started_at),
  }));

  if (exercises.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Empty title="No data yet" hint="Log a few workouts and your progress charts will show up here." />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {exercises.map((e) => (
          <Chip key={e.id} label={e.name} active={e.id === selectedId} onPress={() => setSelectedId(e.id)} />
        ))}
      </ScrollView>

      <Card style={{ marginTop: space.md, gap: space.md }}>
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

      <SectionTitle>Sessions</SectionTitle>
      <View style={{ gap: space.xs }}>
        {[...stats].reverse().map((s) => (
          <Pressable
            key={s.workout_id}
            onPress={() => router.push(`/workout/${s.workout_id}`)}
            style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <Text style={[font.dim, { flex: 1 }]}>{formatDate(s.started_at)}</Text>
            <Text style={[font.body, { fontVariant: ['tabular-nums'] }]}>
              {s.set_count} sets · top {formatLoad(s.top_weight, loadType)}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle>All workouts</SectionTitle>
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
    </ScrollView>
  );
}

function Chip(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingHorizontal: space.md,
        paddingVertical: 8,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: props.active ? colors.accent : colors.border,
        backgroundColor: props.active ? colors.accent : colors.surface,
      }}
    >
      <Text style={{ color: props.active ? colors.accentText : colors.text, fontWeight: '600' }}>{props.label}</Text>
    </Pressable>
  );
}
