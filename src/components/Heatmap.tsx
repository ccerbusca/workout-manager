import React, { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { addWeeks, daysOfWeek, startOfLocalDay, startOfWeek, type TrainingDay } from '../lib/consistency';
import { radius, space, useTheme } from '../theme';

/*
 * Training-calendar pieces, drawn with plain Views (no SVG needed for squares).
 * Cell colour: rest days use surfaceAlt; training days use the accent at 4 strengths (level 1–4,
 * from intensityScale: quartiles of your own sets per day).
 */

type Level = 0 | 1 | 2 | 3 | 4;
const OPACITY: Record<Exclude<Level, 0>, number> = { 1: 0.3, 2: 0.5, 3: 0.75, 4: 1 };

function Cell(props: { size: number; level: Level; day: TrainingDay | undefined; isFuture?: boolean; isToday?: boolean }) {
  const { colors } = useTheme();
  const { size, level, day } = props;
  // Tapping a training day opens its workout (the first one if there were several)
  const open = day ? () => router.push(`/workout/${day.workoutIds[0]}`) : undefined;
  return (
    <Pressable onPress={open} disabled={!open} hitSlop={2}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(2, size / 5),
          backgroundColor: level === 0 ? colors.surfaceAlt : colors.accent,
          opacity: props.isFuture ? 0.25 : level === 0 ? 1 : OPACITY[level],
          borderWidth: props.isToday ? 1.5 : 0,
          borderColor: colors.text,
        }}
      />
    </Pressable>
  );
}

/** Last `weeks` weeks as columns (oldest left), Monday–Sunday as rows. Fits its container's width. */
export function WeeksHeatmap(props: {
  days: Map<number, TrainingDay>;
  level: (sets: number | undefined) => Level;
  weeks?: number;
  now?: number;
}) {
  const { font } = useTheme();
  const weeks = props.weeks ?? 16;
  const now = props.now ?? Date.now();
  const [width, setWidth] = useState(0);
  const labelW = 16;
  const gap = 3;
  const size = width > 0 ? Math.floor((width - labelW - gap * (weeks - 1)) / weeks) : 0;
  const today = startOfLocalDay(now);

  const first = addWeeks(startOfWeek(now), -(weeks - 1));
  const columns = Array.from({ length: weeks }, (_, i) => addWeeks(first, i));

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row' }}>
      {size > 0 ? (
        <>
          <View style={{ width: labelW, gap }}>
            {['M', '', 'W', '', 'F', '', ''].map((l, i) => (
              <Text key={i} style={[font.small, { height: size, lineHeight: size, fontSize: 10 }]}>
                {l}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap }}>
            {columns.map((wk) => (
              <View key={wk} style={{ gap }}>
                {daysOfWeek(wk).map((d) => (
                  <Cell
                    key={d}
                    size={size}
                    level={props.level(props.days.get(d)?.sets)}
                    day={props.days.get(d)}
                    isFuture={d > today}
                    isToday={d === today}
                  />
                ))}
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A whole year as 12 small month calendars, 3 per row. Tap a training day to open the workout. */
export function YearCalendar(props: { year: number; days: Map<number, TrainingDay>; level: (sets: number | undefined) => Level }) {
  const { font } = useTheme();
  const [width, setWidth] = useState(0);
  const colGap = space.md;
  const monthW = width > 0 ? (width - colGap * 2) / 3 : 0;
  const gap = 2;
  const size = monthW > 0 ? Math.floor((monthW - gap * 6) / 7) : 0;
  const today = startOfLocalDay(Date.now());

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: colGap, rowGap: space.lg }}
    >
      {size > 0
        ? MONTHS.map((name, m) => {
            const first = new Date(props.year, m, 1);
            const lead = (first.getDay() + 6) % 7; // blanks before the 1st (weeks start Monday)
            const count = new Date(props.year, m + 1, 0).getDate();
            const cells: (number | null)[] = [
              ...Array<null>(lead).fill(null),
              ...Array.from({ length: count }, (_, i) => new Date(props.year, m, i + 1).getTime()),
            ];
            const trained = cells.filter((d) => d != null && props.days.has(d)).length;
            return (
              <View key={m} style={{ width: monthW, gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[font.small, { fontWeight: '700' }]}>{name}</Text>
                  {trained ? <Text style={[font.small, { fontSize: 10 }]}>{trained}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                  {cells.map((d, i) =>
                    d == null ? (
                      <View key={`b${i}`} style={{ width: size, height: size }} />
                    ) : (
                      <Cell
                        key={d}
                        size={size}
                        level={props.level(props.days.get(d)?.sets)}
                        day={props.days.get(d)}
                        isFuture={d > today}
                        isToday={d === today}
                      />
                    ),
                  )}
                </View>
              </View>
            );
          })
        : null}
    </View>
  );
}

/** "Less ▢▢▢▢▢ More" key for the heatmap colours. */
export function HeatmapLegend() {
  const { colors, font } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Text style={[font.small, { marginRight: 3 }]}>Less</Text>
      {([0, 1, 2, 3, 4] as Level[]).map((l) => (
        <View
          key={l}
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            backgroundColor: l === 0 ? colors.surfaceAlt : colors.accent,
            opacity: l === 0 ? 1 : OPACITY[l],
          }}
        />
      ))}
      <Text style={[font.small, { marginLeft: 3 }]}>More</Text>
    </View>
  );
}

/** Workouts per week as bars, with a dashed line at the weekly goal. Goal weeks are accent-coloured. */
export function WeeklyBars(props: { weeks: { week: number; count: number }[]; goal: number; height?: number }) {
  const { colors, font } = useTheme();
  const height = props.height ?? 90;
  const max = Math.max(props.goal + 1, ...props.weeks.map((w) => w.count));
  const goalY = (props.goal / max) * height;
  return (
    <View>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}>
        {props.weeks.map((w) => (
          <View
            key={w.week}
            style={{
              flex: 1,
              height: Math.max(w.count > 0 ? 3 : 1, (w.count / max) * height),
              borderTopLeftRadius: radius.sm / 4,
              borderTopRightRadius: radius.sm / 4,
              backgroundColor: w.count >= props.goal ? colors.accent : w.count > 0 ? colors.textFaint : colors.surfaceAlt,
            }}
          />
        ))}
        {/* goal line */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: goalY,
            borderTopWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.text,
            opacity: 0.5,
          }}
        />
      </View>
      <Text style={[font.small, { marginTop: 4 }]}>
        Dashed line: goal of {props.goal} a week · bright bars met it
      </Text>
    </View>
  );
}
