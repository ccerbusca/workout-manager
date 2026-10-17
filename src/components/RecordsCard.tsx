import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { listExerciseSetHistory } from '../db/repo';
import type { LoadType } from '../db/types';
import { formatDayMonth, formatLoad, formatWeight } from '../lib/format';
import { summarizeRecords, type ExerciseRecords, type RecordEntry } from '../lib/records';
import { radius, space, useTheme } from '../theme';

/**
 * All-time records for one exercise in one unit: heaviest, best est. 1RM (kg only) and a rep-max
 * table (best weight/level done for at least 1, 3, 5, 8, 10, 12 reps). Tap a record to open the
 * workout it was set in. `reloadKey` changes whenever the caller's data reloads.
 */
export function RecordsCard(props: { exerciseId: string; unit: LoadType; reloadKey?: unknown; embedded?: boolean }) {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [rec, setRec] = useState<ExerciseRecords | null>(null);

  useEffect(() => {
    let cancelled = false;
    listExerciseSetHistory(db, props.exerciseId).then((h) => {
      if (!cancelled) setRec(summarizeRecords(h, props.unit));
    });
    return () => {
      cancelled = true;
    };
  }, [db, props.exerciseId, props.unit, props.reloadKey]);

  if (!rec?.heaviest) return null;
  const level = props.unit === 'level';
  const open = (e: RecordEntry | null) => e && router.push(`/workout/${e.workoutId}`);

  return (
    <View
      style={
        props.embedded
          ? { padding: space.lg, gap: space.sm }
          : {
              marginTop: space.md,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: space.lg,
              gap: space.sm,
            }
      }
    >
      <Text style={[font.small, { letterSpacing: 1, fontWeight: '700' }]}>🏆 RECORDS</Text>

      <RecordRow
        label={level ? 'Highest level' : 'Heaviest'}
        value={`${formatLoad(rec.heaviest.value, props.unit)} × ${rec.heaviest.reps}`}
        date={rec.heaviest.startedAt}
        onPress={() => open(rec.heaviest)}
      />
      {rec.bestE1rm ? (
        <RecordRow
          label="Est. 1RM"
          value={`${formatWeight(Math.round(rec.bestE1rm.value * 10) / 10)} kg`}
          date={rec.bestE1rm.startedAt}
          onPress={() => open(rec.bestE1rm)}
        />
      ) : null}

      {/* Rep maxes: best weight/level done for at least N reps */}
      <View style={{ marginTop: space.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, paddingVertical: 6 }}>
          <Text style={[font.small, { width: 52, paddingLeft: space.sm, fontWeight: '700' }]}>REPS</Text>
          {rec.repMax.map((c) => (
            <Text key={c.reps} style={[font.small, { flex: 1, textAlign: 'center', fontWeight: '700' }]}>
              {c.reps}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={[font.small, { width: 52, paddingLeft: space.sm, fontWeight: '700' }]}>{level ? 'LEVEL' : 'KG'}</Text>
          {rec.repMax.map((c) => (
            <Pressable key={c.reps} onPress={() => open(c.best)} disabled={!c.best} style={{ flex: 1 }} hitSlop={4}>
              <Text
                style={[
                  font.body,
                  { textAlign: 'center', fontWeight: '700', fontVariant: ['tabular-nums'] },
                  !c.best && { color: colors.textFaint, fontWeight: '400' },
                ]}
              >
                {c.best ? formatWeight(c.best.value) : '—'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={font.small}>Best {level ? 'level' : 'weight'} you did for at least that many reps. Tap a record to open that workout.</Text>
    </View>
  );
}

function RecordRow(props: { label: string; value: string; date: number; onPress: () => void }) {
  const { colors, font } = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={[font.dim, { width: 110 }]}>{props.label}</Text>
      <Text style={[font.body, { flex: 1, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }]}>
        {props.value}
      </Text>
      <Text style={font.small}>{formatDayMonth(props.date)}</Text>
    </Pressable>
  );
}
