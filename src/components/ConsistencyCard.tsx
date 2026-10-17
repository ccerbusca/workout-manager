import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { listTrainingLog } from '../db/repo';
import { computeStreaks, intensityScale, trainingDays, weeklyCounts, type LoggedWorkout } from '../lib/consistency';
import { formatWeeks } from '../lib/format';
import { prefs } from '../lib/prefs';
import { radius, space, useTheme } from '../theme';
import { HeatmapLegend, WeeksHeatmap } from './Heatmap';

/**
 * Top of the Progress tab: this week vs the weekly goal, current and best streak (in goal weeks),
 * and the last 16 weeks of the training calendar. "See all" opens the full Consistency screen.
 * `reloadKey` changes whenever the caller's data reloads (e.g. on tab focus).
 */
export function ConsistencyCard(props: { reloadKey?: unknown }) {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [log, setLog] = useState<LoggedWorkout[] | null>(null);
  const goal = prefs.getWeeklyGoal();

  useEffect(() => {
    listTrainingLog(db).then(setLog);
  }, [db, props.reloadKey]);

  if (!log || log.length === 0) return null;
  const now = Date.now();
  const streaks = computeStreaks(weeklyCounts(log, now), goal, now);
  const days = trainingDays(log);

  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: space.lg,
        gap: space.md,
      }}
    >
      <Text style={[font.small, { letterSpacing: 1, fontWeight: '700' }]}>CONSISTENCY</Text>
      <View style={{ flexDirection: 'row' }}>
        <Stat label="This week" value={`${streaks.thisWeek}/${goal}`} done={streaks.thisWeek >= goal} />
        <Stat label="Streak" value={formatWeeks(streaks.current)} />
        <Stat label="Best" value={formatWeeks(streaks.best)} />
      </View>
      <WeeksHeatmap days={days} level={intensityScale(days)} weeks={16} now={now} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <HeatmapLegend />
        <Pressable onPress={() => router.push('/consistency')} hitSlop={8}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>See all ›</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Stat(props: { label: string; value: string; done?: boolean }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={font.small}>{props.label.toUpperCase()}</Text>
      <Text
        style={[font.h2, { fontVariant: ['tabular-nums'], color: props.done ? colors.accent : colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {props.value}
      </Text>
    </View>
  );
}
