import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { Stack } from 'expo-router';
import { BalanceBars, useMuscleBalanceData, WindowToggle } from '../src/components/MuscleBalance';
import { Empty, Loading, SectionTitle } from '../src/components/ui';
import { muscleBalance, STALE_DAYS } from '../src/lib/muscleBalance';
import { space, useTheme } from '../src/theme';

/** Every muscle group your exercises use: sets in the chosen window and days since last trained. */
export default function MusclesScreen() {
  const { font } = useTheme();
  const data = useMuscleBalanceData();
  const [windowDays, setWindowDays] = useState<7 | 30>(7);

  if (!data) return <Loading />;
  if (data.groups.length === 0) return <Empty title="No muscle groups yet" hint="Give your exercises muscle groups on the Exercises tab." />;

  const rows = muscleBalance(data.log, data.groups, windowDays, Date.now());
  const trained = rows.filter((r) => r.sets > 0);
  const notTrained = rows.filter((r) => r.sets === 0);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}>
      <Stack.Screen options={{ title: 'Muscle balance' }} />
      <WindowToggle value={windowDays} onChange={setWindowDays} />
      <Text style={[font.small, { marginTop: space.sm }]}>
        Each set counts fully for every muscle group of its exercise (Bench Press adds to Chest, Shoulders and Triceps).
        ⚠ marks groups not trained for {STALE_DAYS}+ days.
      </Text>

      <SectionTitle>{`Trained in the last ${windowDays} days`}</SectionTitle>
      {trained.length ? <BalanceBars rows={trained} /> : <Text style={font.small}>Nothing in this period.</Text>}

      {notTrained.length ? (
        <>
          <SectionTitle>Not trained in this period</SectionTitle>
          <BalanceBars rows={notTrained} />
        </>
      ) : null}
    </ScrollView>
  );
}
