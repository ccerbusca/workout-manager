import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { createExercise, listExercises } from '../db/repo';
import type { Exercise } from '../db/types';
import { space, useTheme } from '../theme';
import { Button, Field } from './ui';

/** Full-screen modal to search and pick an exercise, or create a new one on the fly. */
export function ExercisePicker(props: {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  excludeIds?: string[];
}) {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [all, setAll] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (props.visible) {
      setQuery('');
      listExercises(db).then(setAll);
    }
  }, [props.visible, db]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const exclude = new Set(props.excludeIds ?? []);
    return all.filter(
      (e) =>
        !exclude.has(e.id) &&
        (q === '' || e.name.toLowerCase().includes(q) || (e.muscle_groups ?? '').toLowerCase().includes(q)),
    );
  }, [all, query, props.excludeIds]);

  const exactMatch = all.some((e) => e.name.toLowerCase() === query.trim().toLowerCase());

  const createAndPick = async () => {
    const name = query.trim();
    if (!name) return;
    const id = await createExercise(db, name, []);
    props.onPick({ id, name, muscle_groups: null, load_type: 'weight' });
  };

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          padding: space.lg,
          paddingTop: Platform.OS === 'ios' ? space.xl : 48,
          gap: space.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={font.h2}>Pick exercise</Text>
          <Button title="Close" variant="ghost" onPress={props.onClose} />
        </View>
        <Field placeholder="Search or type a new name…" value={query} onChangeText={setQuery} autoFocus />
        {query.trim() !== '' && !exactMatch && (
          <Button title={`+ Create "${query.trim()}"`} variant="secondary" onPress={createAndPick} />
        )}
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => props.onPick(item)}
              style={({ pressed }) => ({
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={font.body}>{item.name}</Text>
              {item.muscle_groups || item.load_type === 'level' ? (
                <Text style={font.small}>
                  {[item.muscle_groups, item.load_type === 'level' ? 'machine level' : null].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}
