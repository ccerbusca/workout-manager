import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Dialog } from '../../src/components/Dialog';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createExercise,
  createMuscleGroup,
  deleteExercise,
  getExerciseMuscleGroupIds,
  listExerciseMuscleGroupLinks,
  listExercises,
  listMuscleGroups,
  updateExercise,
} from '../../src/db/repo';
import type { Exercise, MuscleGroup } from '../../src/db/types';
import { MuscleGroupSelect } from '../../src/components/MuscleGroupSelect';
import { Button, Card, Field, SectionTitle } from '../../src/components/ui';
import { space, useTheme } from '../../src/theme';
import { KeyboardScrollView } from '../../src/components/KeyboardScrollView';

const OTHER = 'Other';

export default function ExercisesScreen() {
  const { font } = useTheme();
  const db = useSQLiteContext();
  const [items, setItems] = useState<Exercise[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [links, setLinks] = useState<{ exercise_id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  // An exercise can be listed under several groups, so editing is keyed by "<group>|<exercise id>"
  // to open the edit card only where it was tapped
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);

  const load = useCallback(() => {
    listExercises(db).then(setItems);
    listMuscleGroups(db).then(setMuscleGroups);
    listExerciseMuscleGroupLinks(db).then(setLinks);
  }, [db]);
  useFocusEffect(load);

  /** Saves a new group to the shared list, so it's offered for every exercise from now on. */
  const addMuscleGroup = async (groupName: string) => {
    const g = await createMuscleGroup(db, groupName);
    setMuscleGroups(await listMuscleGroups(db));
    return g;
  };

  const add = async () => {
    if (!name.trim()) return;
    await createExercise(db, name, groupIds);
    setName('');
    setGroupIds([]);
    load();
  };

  const startEdit = async (key: string, e: Exercise) => {
    setEditingKey(key);
    setEditName(e.name);
    setEditGroupIds(await getExerciseMuscleGroupIds(db, e.id));
  };

  const saveEdit = async (e: Exercise) => {
    if (!editName.trim()) return;
    await updateExercise(db, e.id, editName, editGroupIds);
    setEditingKey(null);
    load();
  };

  const remove = (e: Exercise) => {
    Dialog.alert('Delete exercise?', `"${e.name}" will be removed from routines. Logged history is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteExercise(db, e.id);
          setEditingKey(null);
          load();
        },
      },
    ]);
  };

  // Group by muscle group for a scannable list; an exercise appears under each of its groups
  const groupNamesByExercise = new Map<string, string[]>();
  for (const l of links) groupNamesByExercise.set(l.exercise_id, [...(groupNamesByExercise.get(l.exercise_id) ?? []), l.name]);
  const groups = new Map<string, Exercise[]>();
  for (const e of items) {
    for (const key of groupNamesByExercise.get(e.id) ?? [OTHER]) groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const sections = [...groups.entries()].sort(([a], [b]) =>
    a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );

  return (
    <KeyboardScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: space.sm }}>
        <Text style={font.h2}>Add exercise</Text>
        <Field placeholder="Name, e.g. Hip Thrust" value={name} onChangeText={setName} />
        <MuscleGroupSelect options={muscleGroups} selected={groupIds} onChange={setGroupIds} onCreate={addMuscleGroup} />
        <Button title="Add" onPress={add} disabled={!name.trim()} />
      </Card>

      {sections.map(([g, list]) => (
        <View key={g}>
          <SectionTitle>{g}</SectionTitle>
          <View style={{ gap: space.sm }}>
            {list.map((e) => {
              const key = `${g}|${e.id}`;
              return editingKey === key ? (
                <Card key={e.id} style={{ gap: space.sm }}>
                  <Field value={editName} onChangeText={setEditName} placeholder="Name" />
                  <MuscleGroupSelect
                    options={muscleGroups}
                    selected={editGroupIds}
                    onChange={setEditGroupIds}
                    onCreate={addMuscleGroup}
                  />
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Button title="Save" onPress={() => saveEdit(e)} style={{ flex: 1 }} />
                    <Button title="Cancel" variant="secondary" onPress={() => setEditingKey(null)} style={{ flex: 1 }} />
                  </View>
                  <Button title="Delete exercise" variant="danger" onPress={() => remove(e)} />
                </Card>
              ) : (
                <Card key={e.id} onPress={() => startEdit(key, e)} style={{ paddingVertical: space.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={font.body}>{e.name}</Text>
                    {e.load_type === 'level' ? <Text style={font.small}>LEVEL</Text> : null}
                  </View>
                </Card>
              );
            })}
          </View>
        </View>
      ))}
    </KeyboardScrollView>
  );
}
