import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Dialog } from '../../src/components/Dialog';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import {
  addExerciseToRoutine,
  deleteRoutine,
  getActiveWorkout,
  getRoutine,
  listRoutineExercises,
  removeRoutineExercise,
  renameRoutine,
  reorderRoutineExercises,
  startWorkout,
} from '../../src/db/repo';
import type { RoutineExercise } from '../../src/db/types';
import { ExercisePicker } from '../../src/components/ExercisePicker';
import { Button, Card, Empty, Field, SectionTitle } from '../../src/components/ui';
import { colors, font, space } from '../../src/theme';

export default function RoutineEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [name, setName] = useState('');
  const [items, setItems] = useState<RoutineExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await getRoutine(db, id);
    if (r) setName(r.name);
    setItems(await listRoutineExercises(db, id));
  }, [db, id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveName = async () => {
    if (name.trim()) await renameRoutine(db, id, name);
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    await reorderRoutineExercises(db, next.map((i) => i.id));
  };

  const remove = async (item: RoutineExercise) => {
    await removeRoutineExercise(db, item.id);
    load();
  };

  const confirmDelete = () => {
    Dialog.alert('Delete routine?', 'Past workouts stay in your history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRoutine(db, id);
          router.back();
        },
      },
    ]);
  };

  const start = async () => {
    await saveName();
    const active = await getActiveWorkout(db);
    if (active) {
      Dialog.alert('Workout in progress', 'Finish your current workout first.', [
        { text: 'Go to it', onPress: () => router.push(`/workout/${active.id}`) },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }
    const wid = await startWorkout(db, id);
    router.replace(`/workout/${wid}`);
  };

  return (
    <>
      <Stack.Screen options={{ title: name || 'Routine' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
        <Field label="Name" value={name} onChangeText={setName} onBlur={saveName} onSubmitEditing={saveName} />

        <SectionTitle right={<Button title="+ Add" variant="ghost" onPress={() => setPickerOpen(true)} />}>
          Exercises
        </SectionTitle>

        {items.length === 0 ? (
          <Card>
            <Empty title="No exercises yet" hint="Add the exercises you do in this routine." />
            <Button title="Add exercise" onPress={() => setPickerOpen(true)} />
          </Card>
        ) : (
          <View style={{ gap: space.sm }}>
            {items.map((item, i) => (
              <Card key={item.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md }}>
                <Text style={[font.dim, { width: 24 }]}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={font.body}>{item.name}</Text>
                  {item.muscle_group ? <Text style={font.small}>{item.muscle_group}</Text> : null}
                </View>
                <IconBtn name="chevron-up" onPress={() => move(i, -1)} disabled={i === 0} />
                <IconBtn name="chevron-down" onPress={() => move(i, 1)} disabled={i === items.length - 1} />
                <IconBtn name="close" onPress={() => remove(item)} color={colors.danger} />
              </Card>
            ))}
          </View>
        )}

        <View style={{ gap: space.sm, marginTop: space.xl }}>
          <Button title="Start this workout" big onPress={start} disabled={items.length === 0} />
          <Button title="Delete routine" variant="danger" onPress={confirmDelete} />
        </View>
      </ScrollView>

      <ExercisePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        excludeIds={items.map((i) => i.exercise_id)}
        onPick={async (e) => {
          setPickerOpen(false);
          await addExerciseToRoutine(db, id, e.id);
          load();
        }}
      />
    </>
  );
}

function IconBtn(props: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable onPress={props.onPress} disabled={props.disabled} hitSlop={8} style={{ padding: 8, opacity: props.disabled ? 0.25 : 1 }}>
      <Ionicons name={props.name} size={20} color={props.color ?? colors.textDim} />
    </Pressable>
  );
}
