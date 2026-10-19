import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { listExerciseSetHistory, listRoutineNamesForExercise } from '../db/repo';
import type { Exercise, SetHistoryRow } from '../db/types';
import { formatAgo, formatDayMonth, formatLoad } from '../lib/format';
import { summarizeRecords } from '../lib/records';
import { radius, space, useTheme } from '../theme';
import { Button } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * The expanded part of an exercise card on the Exercises tab:
 * - muscle groups as tinted chips, routines as outlined chips;
 * - the last session set by set ("100 kg × 10", "level 7 × 12"), which is what you want to know before
 *   doing it again;
 * - the best set (trophy) and how many workouts it's been in;
 * - Edit and See progress.
 * Loads its own data when it mounts, i.e. when the card is expanded, and renders nothing until
 * it's there, so the Collapsible around it opens straight to the final height.
 */
export function ExerciseDetails(props: {
  exercise: Exercise;
  muscleGroups: string[];
  /** Changes when the parent reloads, so the details reload too. */
  reloadKey: unknown;
  onEdit: () => void;
  onSeeProgress: () => void;
}) {
  const { exercise: e } = props;
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [history, setHistory] = useState<SetHistoryRow[] | null>(null);
  const [routines, setRoutines] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([listExerciseSetHistory(db, e.id), listRoutineNamesForExercise(db, e.id)]).then(([h, r]) => {
      setHistory(h);
      setRoutines(r);
    });
  }, [db, e.id, props.reloadKey]);

  if (!history) return null;

  const sessions = new Set(history.map((s) => s.workout_id)).size;
  const last = history.length ? history[history.length - 1] : null;
  const lastSets = last ? history.filter((s) => s.workout_id === last.workout_id) : [];

  // Best in the current unit; fall back to the other one if that's all there is
  const bestUnit = history.some((s) => s.load_type === e.load_type) || !history.length ? e.load_type : history[0].load_type;
  const best = summarizeRecords(history, bestUnit).heaviest;

  const chip = { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.lg } as const;

  return (
    <View style={{ gap: space.md, paddingTop: space.md }}>
      <View style={{ height: 1, backgroundColor: colors.border }} />

      {props.muscleGroups.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {props.muscleGroups.map((g) => (
            // The accent at ~15% opacity (every theme's accent is #RRGGBB)
            <View key={`g:${g}`} style={[chip, { backgroundColor: `${colors.accent}26` }]}>
              <Text style={[font.small, { color: colors.accent, fontWeight: '600' }]}>{g}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {routines.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: props.muscleGroups.length ? -space.xs : 0 }}>
          {routines.map((r) => (
            <View
              key={`r:${r}`}
              style={[chip, { borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 4 }]}
            >
              <Ionicons name="list-outline" size={12} color={colors.textDim} />
              <Text style={[font.small, { color: colors.textDim }]}>{r}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {last ? (
        <View style={{ gap: space.xs }}>
          <Text style={font.dim}>Last time · {formatAgo(last.started_at)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {lastSets.map((s) => (
              <View key={s.id} style={[chip, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[font.body, { fontVariant: ['tabular-nums'] }]}>{formatLoad(s.weight, s.load_type)} × {s.reps}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: space.xs }}>
        {best ? (
          <InfoRow icon="trophy-outline">
            {formatLoad(best.value, bestUnit)} × {best.reps} · {formatDayMonth(best.startedAt)}
          </InfoRow>
        ) : null}
        <InfoRow icon="calendar-outline">
          {last ? `${sessions} workout${sessions === 1 ? '' : 's'}` : 'Not logged yet'}
        </InfoRow>
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Edit" onPress={props.onEdit} style={{ flex: 1 }} />
        {last ? <Button title="See progress" variant="secondary" onPress={props.onSeeProgress} style={{ flex: 1 }} /> : null}
      </View>
    </View>
  );
}

function InfoRow(props: { icon: IconName; children: React.ReactNode }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Ionicons name={props.icon} size={16} color={colors.textFaint} />
      <Text style={[font.body, { flex: 1 }]}>{props.children}</Text>
    </View>
  );
}
