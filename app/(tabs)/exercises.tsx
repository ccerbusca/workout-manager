import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Dialog } from '../../src/components/Dialog';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createExercise, deleteExercise, listExercises, updateExercise } from '../../src/db/repo';
import type { Exercise } from '../../src/db/types';
import { Button, Card, Field, SectionTitle } from '../../src/components/ui';
import { font, space } from '../../src/theme';

export default function ExercisesScreen() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<Exercise[]>([]);
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGroup, setEditGroup] = useState('');

  const load = useCallback(() => {
    listExercises(db).then(setItems);
  }, [db]);
  useFocusEffect(load);

  const add = async () => {
    if (!name.trim()) return;
    await createExercise(db, name, group);
    setName('');
    setGroup('');
    load();
  };

  const startEdit = (e: Exercise) => {
    setEditingId(e.id);
    setEditName(e.name);
    setEditGroup(e.muscle_group ?? '');
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await updateExercise(db, editingId, editName, editGroup);
    setEditingId(null);
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
          setEditingId(null);
          load();
        },
      },
    ]);
  };

  // Group by muscle group for a scannable list
  const groups = new Map<string, Exercise[]>();
  for (const e of items) {
    const key = e.muscle_group || 'Other';
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: space.sm }}>
        <Text style={font.h2}>Add exercise</Text>
        <Field placeholder="Name, e.g. Hip Thrust" value={name} onChangeText={setName} />
        <Field placeholder="Muscle group (optional)" value={group} onChangeText={setGroup} />
        <Button title="Add" onPress={add} disabled={!name.trim()} />
      </Card>

      {[...groups.entries()].map(([g, list]) => (
        <View key={g}>
          <SectionTitle>{g}</SectionTitle>
          <View style={{ gap: space.sm }}>
            {list.map((e) =>
              editingId === e.id ? (
                <Card key={e.id} style={{ gap: space.sm }}>
                  <Field value={editName} onChangeText={setEditName} placeholder="Name" />
                  <Field value={editGroup} onChangeText={setEditGroup} placeholder="Muscle group" />
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Button title="Save" onPress={saveEdit} style={{ flex: 1 }} />
                    <Button title="Cancel" variant="secondary" onPress={() => setEditingId(null)} style={{ flex: 1 }} />
                  </View>
                  <Button title="Delete exercise" variant="danger" onPress={() => remove(e)} />
                </Card>
              ) : (
                <Card key={e.id} onPress={() => startEdit(e)} style={{ paddingVertical: space.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={font.body}>{e.name}</Text>
                    {e.load_type === 'level' ? <Text style={font.small}>LEVEL</Text> : null}
                  </View>
                </Card>
              ),
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
