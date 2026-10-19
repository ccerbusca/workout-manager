import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { listExerciseSetHistory, listRoutineNamesForExercise } from '../db/repo';
import type { Exercise, SetHistoryRow } from '../db/types';
import { formatAgo, formatDayMonth, formatLoad, formatSessionSummary, formatWeight } from '../lib/format';
import { summarizeRecords } from '../lib/records';
import { space, useTheme } from '../theme';
import { Button } from './ui';

/**
 * The expanded part of an exercise card on the Exercises tab: what the exercise is (groups, unit,
 * routines) and how it's been going (sessions, last time, bests), with Edit and See progress.
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

  const unit = e.load_type;
  const sessions = new Set(history?.map((s) => s.workout_id)).size;
  const last = history?.length ? history[history.length - 1] : null;
  const lastSets = last ? history!.filter((s) => s.workout_id === last.workout_id) : [];
  // Bests in the current unit; fall back to the other one if that's all there is
  const bestUnit = history?.some((s) => s.load_type === unit) || !history?.length ? unit : history[0].load_type;
  const records = history ? summarizeRecords(history, bestUnit) : null;

  const rows: [string, string][] = [
    ['Muscle groups', props.muscleGroups.join(', ') || 'None'],
    ['Unit', unit === 'level' ? 'Level (machine setting)' : 'Weight (kg)'],
    ['Routines', routines.join(', ') || 'None'],
  ];
  if (history) {
    if (last) {
      rows.push(['Logged', `${sessions} workout${sessions === 1 ? '' : 's'} · last ${formatAgo(last.started_at)}`]);
      rows.push(['Last time', formatSessionSummary(last.started_at, lastSets, unit)]);
      const h = records?.heaviest;
      if (h) {
        rows.push([
          bestUnit === 'level' ? 'Highest level' : 'Heaviest',
          `${formatLoad(h.value, bestUnit)} × ${h.reps} rep${h.reps === 1 ? '' : 's'} · ${formatDayMonth(h.startedAt)}`,
        ]);
      }
      const b = records?.bestE1rm;
      if (b) rows.push(['Best est. 1RM', `${formatWeight(Math.round(b.value * 10) / 10)} kg · ${formatDayMonth(b.startedAt)}`]);
    } else {
      rows.push(['Logged', 'Not logged yet']);
    }
  }

  if (!history) return null;
  return (
    <View style={{ gap: space.md, paddingTop: space.md }}>
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <View style={{ gap: space.sm }}>
        {rows.map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', gap: space.md }}>
            <Text style={[font.dim, { width: 110 }]}>{label}</Text>
            <Text style={[font.body, { flex: 1 }]}>{value}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Edit" onPress={props.onEdit} style={{ flex: 1 }} />
        {last ? <Button title="See progress" variant="secondary" onPress={props.onSeeProgress} style={{ flex: 1 }} /> : null}
      </View>
    </View>
  );
}
