import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { listWorkoutTrendLog } from '../db/repo';
import { formatDayMonth, formatDuration, formatMonthYear, formatVolume } from '../lib/format';
import { prefs } from '../lib/prefs';
import { trendHeadline, trendSeries, type TrendBucket, type TrendMetric, type TrendPoint, type TrendWorkout } from '../lib/trends';
import { radius, space, useTheme } from '../theme';
import { Segmented } from './ui';

const METRICS: { key: TrendMetric; label: string; note: string }[] = [
  { key: 'volume', label: 'Volume', note: 'Weight × reps of kg sets (machine levels aren’t weight).' },
  { key: 'totalSets', label: 'Total sets', note: 'Every set, kg and levels.' },
  { key: 'setsPerWorkout', label: 'Sets per workout', note: 'Average sets in each workout.' },
  {
    key: 'duration',
    label: 'Duration',
    note: 'Average workout length, only from workouts tracked live in the app (imported and back-filled ones have made-up times).',
  },
];

function formatValue(metric: TrendMetric, v: number | null): string {
  if (v == null) return '—';
  switch (metric) {
    case 'volume':
      return formatVolume(v);
    case 'totalSets':
      return `${Math.round(v)} sets`;
    case 'setsPerWorkout':
      return `${Math.round(v * 10) / 10} sets`;
    case 'duration':
      return formatDuration(0, v * 60_000);
  }
}

function periodLabel(bucket: TrendBucket, p: TrendPoint): string {
  const base = bucket === 'week' ? `Week of ${formatDayMonth(p.start)}` : formatMonthYear(p.start);
  return p.inProgress ? `${base} (so far)` : base;
}

/**
 * Progress → Overview: one metric at a time as bars over the last 12 weeks or months. The headline
 * is the last complete period vs the average of the 4 before it; tap a bar to see that period.
 * `reloadKey` changes whenever the caller's data reloads.
 */
export function TrendsCard(props: { reloadKey?: unknown }) {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [log, setLog] = useState<TrendWorkout[] | null>(null);
  const [metric, setMetric] = useState<TrendMetric>('volume');
  const [bucket, setBucket] = useState<TrendBucket>('week');
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    listWorkoutTrendLog(db, prefs.getBodyweight()).then(setLog);
  }, [db, props.reloadKey]);
  // A different metric or grouping shows different periods: go back to the headline
  useEffect(() => setSelected(null), [metric, bucket]);

  if (!log || log.length === 0) return null;
  const series = trendSeries(log, metric, bucket, Date.now());
  const headline = trendHeadline(series);
  const shown = selected != null ? series[selected] : headline?.point;
  const max = Math.max(1, ...series.map((p) => p.value ?? 0));
  const m = METRICS.find((x) => x.key === metric)!;
  // More volume/sets is good news; for duration a change is neither good nor bad
  const changeColor = (pct: number) => (metric === 'duration' ? colors.textDim : pct >= 0 ? colors.success : colors.danger);
  const periodWord = bucket === 'week' ? '4-week' : '4-month';

  return (
    <View
      style={{
        marginTop: space.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: space.lg,
        gap: space.md,
      }}
    >
      <Text style={[font.small, { letterSpacing: 1, fontWeight: '700' }]}>TRENDS</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
        {METRICS.map((x) => {
          const on = x.key === metric;
          return (
            <Pressable
              key={x.key}
              onPress={() => setMetric(x.key)}
              style={{
                paddingHorizontal: space.md,
                paddingVertical: 6,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: on ? colors.accent : colors.border,
                backgroundColor: on ? colors.accent : 'transparent',
              }}
            >
              <Text style={{ color: on ? colors.accentText : colors.textDim, fontWeight: '700', fontSize: 13 }}>{x.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Segmented
        options={[
          { value: 'week', label: '12 weeks' },
          { value: 'month', label: '12 months' },
        ]}
        value={bucket}
        onChange={setBucket}
      />

      {shown ? (
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' }}>
            <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
              {formatValue(metric, shown.value)}
            </Text>
            {selected == null && headline?.changePct != null ? (
              <Text style={{ color: changeColor(headline.changePct), fontWeight: '700' }}>
                {headline.changePct >= 0 ? '▲' : '▼'} {Math.abs(Math.round(headline.changePct))}% vs {periodWord} avg
              </Text>
            ) : null}
          </View>
          <Text style={font.dim}>{periodLabel(bucket, shown)}</Text>
        </View>
      ) : null}

      <TrendBars series={series} max={max} selected={selected ?? (headline ? series.indexOf(headline.point) : null)} onSelect={setSelected} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={font.small}>{bucket === 'week' ? formatDayMonth(series[0].start) : formatMonthYear(series[0].start)}</Text>
        <Text style={font.small}>{bucket === 'week' ? 'this week' : 'this month'}</Text>
      </View>
      <Text style={font.small}>
        {m.note} Tap a bar to see that {bucket}; the last bar is still in progress.
      </Text>
    </View>
  );
}

/** Tappable bars; empty periods show a flat stub, the in-progress period is faded. */
function TrendBars(props: { series: TrendPoint[]; max: number; selected: number | null; onSelect: (i: number) => void }) {
  const { colors } = useTheme();
  const height = 90;
  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      {props.series.map((p, i) => {
        const isSel = i === props.selected;
        const h = p.value == null || p.value === 0 ? 2 : Math.max(4, (p.value / props.max) * height);
        return (
          <Pressable key={p.start} onPress={() => props.onSelect(i)} style={{ flex: 1, height, justifyContent: 'flex-end' }} hitSlop={2}>
            <View
              style={{
                height: h,
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
                backgroundColor: p.value == null ? colors.surfaceAlt : colors.accent,
                opacity: p.value == null ? 1 : isSel ? 1 : p.inProgress ? 0.3 : 0.55,
                borderWidth: isSel ? 1.5 : 0,
                borderColor: colors.text,
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
