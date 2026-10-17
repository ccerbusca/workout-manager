import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { listTrainingLog } from '../src/db/repo';
import {
  computeStreaks,
  intensityScale,
  summarizeYear,
  trainingDays,
  weeklyCounts,
  yearsWithTraining,
  type LoggedWorkout,
} from '../src/lib/consistency';
import { formatWeeks } from '../src/lib/format';
import { prefs } from '../src/lib/prefs';
import { HeatmapLegend, WeeklyBars, YearCalendar } from '../src/components/Heatmap';
import { Card, Empty, Loading, SectionTitle } from '../src/components/ui';
import { space, useTheme } from '../src/theme';

/**
 * Full consistency view, one calendar year at a time: streaks, that year's totals, workouts per
 * week against the goal, and a month-by-month training calendar (tap a day to open the workout).
 */
export default function ConsistencyScreen() {
  const { font } = useTheme();
  const db = useSQLiteContext();
  const [log, setLog] = useState<LoggedWorkout[] | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const goal = prefs.getWeeklyGoal();

  useFocusEffect(
    useCallback(() => {
      listTrainingLog(db).then(setLog);
    }, [db]),
  );

  if (!log) return <Loading />;
  if (log.length === 0) return <Empty title="No workouts yet" hint="Finished workouts show up here." />;

  const now = Date.now();
  const weeks = weeklyCounts(log, now);
  const streaks = computeStreaks(weeks, goal, now);
  const days = trainingDays(log);
  const level = intensityScale(days);
  // Years from the current one back to the first workout (including empty years in between)
  const years = yearsWithTraining(log);
  const firstYear = Math.min(...years);
  const thisYear = new Date(now).getFullYear();
  const summary = summarizeYear(log, weeks, goal, year);
  const yearWeeks = weeks.filter((w) => new Date(w.week).getFullYear() === year);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}>
      <Stack.Screen options={{ title: 'Consistency' }} />

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat label="This week" value={`${streaks.thisWeek}/${goal}`} highlight={streaks.thisWeek >= goal} />
        <Stat label="Streak" value={formatWeeks(streaks.current)} />
        <Stat label="Best ever" value={formatWeeks(streaks.best)} />
      </View>
      <Text style={[font.small, { marginTop: space.sm }]}>
        A streak is weeks in a row (Mon–Sun) with at least {goal} workout{goal === 1 ? '' : 's'}. This week only counts once
        it reaches the goal, and never breaks the streak while it's still going. Change the goal in Settings.
      </Text>

      {/* Year switcher */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.xl }}>
        <YearButton icon="chevron-back" disabled={year <= firstYear} onPress={() => setYear(year - 1)} />
        <Text style={[font.h1, { flex: 1, textAlign: 'center' }]}>{year}</Text>
        <YearButton icon="chevron-forward" disabled={year >= thisYear} onPress={() => setYear(year + 1)} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <Stat label="Workouts" value={String(summary.workouts)} />
        <Stat label="Goal weeks" value={String(summary.goalWeeks)} />
        <Stat label="Best streak" value={formatWeeks(summary.bestStreak)} />
      </View>

      <SectionTitle>Workouts per week</SectionTitle>
      {yearWeeks.length ? (
        <WeeklyBars weeks={yearWeeks} goal={goal} />
      ) : (
        <Text style={font.small}>No workouts in {year}.</Text>
      )}

      <SectionTitle right={<HeatmapLegend />}>Training days</SectionTitle>
      <YearCalendar year={year} days={days} level={level} />
      <Text style={[font.small, { marginTop: space.md }]}>
        Brighter = more sets that day, compared with your own usual. Tap a day to open the workout.
      </Text>
    </ScrollView>
  );
}

function Stat(props: { label: string; value: string; highlight?: boolean }) {
  const { colors, font } = useTheme();
  return (
    <Card style={{ flex: 1, padding: space.md }}>
      <Text style={font.small}>{props.label.toUpperCase()}</Text>
      <Text
        style={[font.h2, { fontVariant: ['tabular-nums'], color: props.highlight ? colors.accent : colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {props.value}
      </Text>
    </Card>
  );
}

function YearButton(props: { icon: React.ComponentProps<typeof Ionicons>['name']; disabled: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={8}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: props.disabled ? 0.25 : 1 }}
    >
      <Ionicons name={props.icon} size={26} color={colors.text} />
    </Pressable>
  );
}
