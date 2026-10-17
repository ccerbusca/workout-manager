import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createRoutine, listRoutines } from '../../src/db/repo';
import type { Routine } from '../../src/db/types';
import { Button, Card, Empty, Field, SectionTitle } from '../../src/components/ui';
import { space, useTheme } from '../../src/theme';

export default function RoutinesScreen() {
  const { font } = useTheme();
  const db = useSQLiteContext();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [name, setName] = useState('');

  useFocusEffect(
    useCallback(() => {
      listRoutines(db).then(setRoutines);
    }, [db]),
  );

  const create = async () => {
    if (!name.trim()) return;
    const id = await createRoutine(db, name);
    setName('');
    router.push(`/routine/${id}`);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
      <Text style={[font.dim, { marginBottom: space.md }]}>
        A routine is a group of exercises you do together (e.g. “Push day”). It isn’t tied to a weekday:
        you pick one when you start a workout.
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field placeholder="New routine name, e.g. Push day" value={name} onChangeText={setName} onSubmitEditing={create} />
        </View>
        <Button title="Create" onPress={create} disabled={!name.trim()} />
      </View>

      <SectionTitle>Your routines</SectionTitle>
      {routines.length === 0 ? (
        <Empty title="No routines yet" />
      ) : (
        <View style={{ gap: space.sm }}>
          {routines.map((r) => (
            <Card key={r.id} onPress={() => router.push(`/routine/${r.id}`)}>
              <Text style={font.h2}>{r.name}</Text>
              <Text style={font.dim}>
                {r.exercise_count} exercise{r.exercise_count === 1 ? '' : 's'} · tap to edit
              </Text>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
