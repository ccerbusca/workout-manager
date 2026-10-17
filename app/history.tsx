import React, { useCallback, useState } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { exerciseStats, getExerciseName, listWorkoutHistory } from '../src/db/repo';
import type { LoadType } from '../src/db/types';
import { Empty, Loading } from '../src/components/ui';
import { formatDate, formatLoad, formatMonthYear, formatVolume } from '../src/lib/format';
import { space, useTheme } from '../src/theme';

/** One row of the list, whichever kind of history is shown. */
interface Row {
  workoutId: string;
  startedAt: number;
  title: string;
  detail: string;
}

/**
 * Full history, grouped by month (newest first).
 *  /history                              -> every finished workout
 *  /history?exerciseId=<id>&unit=<unit>  -> one exercise's sessions in that unit (kg or level)
 */
export default function HistoryScreen() {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const { exerciseId, unit } = useLocalSearchParams<{ exerciseId?: string; unit?: LoadType }>();
  const [title, setTitle] = useState(exerciseId ? 'Sessions' : 'All workouts');
  const [rows, setRows] = useState<Row[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (exerciseId) {
          const loadType: LoadType = unit === 'level' ? 'level' : 'weight';
          const name = await getExerciseName(db, exerciseId);
          setTitle(name ?? 'Sessions');
          const stats = await exerciseStats(db, exerciseId, loadType);
          setRows(
            [...stats].reverse().map((s) => ({
              workoutId: s.workout_id,
              startedAt: s.started_at,
              title: formatDate(s.started_at),
              detail: `${s.set_count} set${s.set_count === 1 ? '' : 's'} · top ${formatLoad(s.top_weight, loadType)}`,
            })),
          );
        } else {
          const workouts = await listWorkoutHistory(db);
          setRows(
            workouts.map((w) => ({
              workoutId: w.id,
              startedAt: w.started_at,
              title: w.routine_name ?? 'Free workout',
              detail: `${formatDate(w.started_at)} · ${w.set_count} sets · ${formatVolume(w.volume)}`,
            })),
          );
        }
      })();
    }, [db, exerciseId, unit]),
  );

  if (!rows) return <Loading />;

  // Group into months, keeping newest-first order
  const sections: { title: string; data: Row[] }[] = [];
  for (const r of rows) {
    const month = formatMonthYear(r.startedAt);
    if (sections[sections.length - 1]?.title !== month) sections.push({ title: month, data: [] });
    sections[sections.length - 1].data.push(r);
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title }} />
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.workoutId}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: space.xl * 2 }}
        ListEmptyComponent={<Empty title="Nothing logged yet" />}
        renderSectionHeader={({ section }) => (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingHorizontal: space.lg,
              paddingTop: space.lg,
              paddingBottom: space.sm,
              backgroundColor: colors.bg,
            }}
          >
            <Text style={[font.small, { color: colors.accent, letterSpacing: 1 }]}>{section.title.toUpperCase()}</Text>
            <Text style={font.small}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/workout/${item.workoutId}`)}
            style={({ pressed }) => ({
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: pressed ? colors.surface : 'transparent',
            })}
          >
            <Text style={font.body}>{item.title}</Text>
            <Text style={[font.dim, { fontVariant: ['tabular-nums'] }]}>{item.detail}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
