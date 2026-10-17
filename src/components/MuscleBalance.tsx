import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { listMuscleGroupSetLog, listUsedMuscleGroups } from '../db/repo';
import type { MuscleGroup } from '../db/types';
import { BALANCE_WINDOWS, formatDaysSince, muscleBalance, STALE_DAYS, type BalanceRow, type GroupSetEntry } from '../lib/muscleBalance';
import { radius, space, useTheme } from '../theme';
import { Segmented } from './ui';

type WindowDays = (typeof BALANCE_WINDOWS)[number];

/** Loads the muscle-group set log and the groups current exercises use. Reloads when `reloadKey` changes. */
export function useMuscleBalanceData(reloadKey?: unknown) {
  const db = useSQLiteContext();
  const [data, setData] = useState<{ log: GroupSetEntry[]; groups: MuscleGroup[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([listMuscleGroupSetLog(db), listUsedMuscleGroups(db)]).then(([log, groups]) => {
      if (!cancelled) setData({ log, groups });
    });
    return () => {
      cancelled = true;
    };
  }, [db, reloadKey]);
  return data;
}

/** "7 days | 30 days" switch. */
export function WindowToggle(props: { value: WindowDays; onChange: (v: WindowDays) => void }) {
  return (
    <Segmented
      options={BALANCE_WINDOWS.map((d) => ({ value: String(d), label: `${d} days` }))}
      value={String(props.value)}
      onChange={(v) => props.onChange(Number(v) as WindowDays)}
    />
  );
}

/** Horizontal bars of sets per group, with "last trained" on the right; stale groups get ⚠. */
export function BalanceBars(props: { rows: BalanceRow[] }) {
  const { colors, font } = useTheme();
  const max = Math.max(1, ...props.rows.map((r) => r.sets));
  return (
    <View style={{ gap: space.sm }}>
      {props.rows.map((r) => (
        <View key={r.groupId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={[font.dim, { width: 84, color: colors.text }]} numberOfLines={1}>
            {r.name}
          </Text>
          <View style={{ flex: 1, height: 14, borderRadius: radius.sm / 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
            <View
              style={{
                width: `${(r.sets / max) * 100}%`,
                height: '100%',
                borderRadius: radius.sm / 2,
                backgroundColor: colors.accent,
              }}
            />
          </View>
          <Text style={[font.body, { width: 30, textAlign: 'right', fontWeight: '700', fontVariant: ['tabular-nums'] }]}>
            {r.sets}
          </Text>
          <Text
            style={[font.small, { width: 92, textAlign: 'right', color: r.stale ? colors.danger : colors.textFaint }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {r.stale ? '⚠ ' : ''}
            {formatDaysSince(r.daysSince)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Progress → Overview card: top groups for the chosen window, plus "See all" to the full list. */
export function MuscleBalanceCard(props: { reloadKey?: unknown }) {
  const { colors, font } = useTheme();
  const data = useMuscleBalanceData(props.reloadKey);
  const [windowDays, setWindowDays] = useState<WindowDays>(7);
  if (!data || data.groups.length === 0) return null;

  const rows = muscleBalance(data.log, data.groups, windowDays, Date.now());
  const shown = rows.slice(0, 6);
  const staleHidden = rows.slice(6).filter((r) => r.stale).length;

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
      <Text style={[font.small, { letterSpacing: 1, fontWeight: '700' }]}>MUSCLE BALANCE</Text>
      <WindowToggle value={windowDays} onChange={setWindowDays} />
      <BalanceBars rows={shown} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={font.small}>
          Sets in the last {windowDays} days
          {staleHidden ? ` · ${staleHidden} more not trained for ${STALE_DAYS}+ days` : ''}
        </Text>
        {rows.length > shown.length ? (
          <Pressable onPress={() => router.push('/muscles')} hitSlop={8}>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>See all ›</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
