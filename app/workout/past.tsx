import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { listRoutines, startWorkout } from '../../src/db/repo';
import type { Routine } from '../../src/db/types';
import { Calendar, startOfDay } from '../../src/components/Calendar';
import { Dialog } from '../../src/components/Dialog';
import { Button, Card, SectionTitle, Stepper } from '../../src/components/ui';
import { formatDate, parseNumber } from '../../src/lib/format';
import { radius, space, useTheme } from '../../src/theme';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

/** Pick when a past workout happened and which routine it was, then log its sets. */
export default function PastWorkoutScreen() {
  const db = useSQLiteContext();
  const today = startOfDay(Date.now());
  const [day, setDay] = useState(today - 24 * 60 * 60 * 1000); // yesterday is the likeliest
  const [hour, setHour] = useState('18');
  const [minute, setMinute] = useState('0');
  const [duration, setDuration] = useState('60');
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineId, setRoutineId] = useState<string | null>(null);

  useEffect(() => {
    listRoutines(db).then((list) => {
      setRoutines(list);
      setRoutineId(list[0]?.id ?? null);
    });
  }, [db]);

  const create = async () => {
    const h = parseNumber(hour);
    const m = parseNumber(minute);
    const d = parseNumber(duration);
    if (h == null || m == null || d == null || h < 0 || h > 23 || m < 0 || m > 59 || d < 1 || d > 600) {
      Dialog.alert('Check the time', 'Start hour 0–23, minutes 0–59 and a duration of 1–600 minutes.');
      return;
    }
    const date = new Date(day);
    const startedAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.round(h), Math.round(m)).getTime();
    if (startedAt > Date.now()) {
      Dialog.alert('That’s in the future', 'Pick a start time that has already passed.');
      return;
    }
    const id = await startWorkout(db, routineId, { startedAt, endedAt: startedAt + Math.round(d) * 60_000 });
    router.replace(`/workout/${id}?edit=1`);
  };

  return (
    <KeyboardAwareScrollView bottomOffset={space.lg} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Log a past workout' }} />

      <Card>
        <Calendar value={day} onChange={setDay} max={today} />
      </Card>

      <SectionTitle>Time</SectionTitle>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Stepper label="start hour" value={hour} onChange={setHour} step={1} />
        <Stepper label="min" value={minute} onChange={setMinute} step={15} />
      </View>
      <View style={{ flexDirection: 'row', marginTop: space.md }}>
        <Stepper label="duration (min)" value={duration} onChange={setDuration} step={15} />
      </View>

      <SectionTitle>Routine</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {routines.map((r) => (
          <Chip key={r.id} label={r.name} active={routineId === r.id} onPress={() => setRoutineId(r.id)} />
        ))}
        <Chip label="Empty workout" active={routineId === null} onPress={() => setRoutineId(null)} />
      </View>

      <Button title={`Log ${formatDate(day)} ›`} big style={{ marginTop: space.xl }} onPress={create} />
    </KeyboardAwareScrollView>
  );
}

function Chip(props: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingHorizontal: space.md,
        paddingVertical: 10,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: props.active ? colors.accent : colors.border,
        backgroundColor: props.active ? colors.accent : colors.surface,
      }}
    >
      <Text style={{ color: props.active ? colors.accentText : colors.text, fontWeight: '600' }}>{props.label}</Text>
    </Pressable>
  );
}
