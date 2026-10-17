import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
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
import { DragHandle } from '../../src/components/DragHandle';
import { ExercisePicker } from '../../src/components/ExercisePicker';
import { Button, Card, Empty, Field, SectionTitle } from '../../src/components/ui';
import { space, useTheme } from '../../src/theme';

export default function RoutineEditor() {
  const { colors, font } = useTheme();
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

  // Drag and drop: show the new order immediately, then save it
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const onReorder = ({ data }: { data: RoutineExercise[] }) => {
    setItems(data);
    reorderRoutineExercises(db, data.map((i) => i.id));
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
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}
        keyboardShouldPersistTaps="handled"
      >
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
          <Sortable.Grid
            columns={1}
            rowGap={space.sm}
            data={items}
            keyExtractor={(item) => item.id}
            customHandle
            scrollableRef={scrollRef}
            onDragEnd={onReorder}
            renderItem={({ item, index }) => (
              <Card style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: space.md }}>
                <Text style={[font.dim, { width: 24 }]}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={font.body}>{item.name}</Text>
                  {item.muscle_groups ? <Text style={font.small}>{item.muscle_groups}</Text> : null}
                </View>
                <IconBtn name="close" onPress={() => remove(item)} color={colors.danger} />
                <DragHandle />
              </Card>
            )}
          />
        )}

        <View style={{ gap: space.sm, marginTop: space.xl }}>
          <Button title="Start this workout" big onPress={start} disabled={items.length === 0} />
          <Button title="Delete routine" variant="danger" onPress={confirmDelete} />
        </View>
      </Animated.ScrollView>

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
  const { colors } = useTheme();
  return (
    <Pressable onPress={props.onPress} disabled={props.disabled} hitSlop={8} style={{ padding: 8, opacity: props.disabled ? 0.25 : 1 }}>
      <Ionicons name={props.name} size={20} color={props.color ?? colors.textDim} />
    </Pressable>
  );
}
