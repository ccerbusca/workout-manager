import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { createExercise, listExerciseMuscleGroupLinks, listExercisesWithUsage } from '../db/repo';
import type { Exercise, ExerciseUsage } from '../db/types';
import { groupsByExerciseId, muscleGroupFilters, searchExercises } from '../lib/exerciseSearch';
import { formatDayMonth } from '../lib/format';
import { radius, space, useTheme } from '../theme';
import { FilterChip } from './FilterChip';
import { Button } from './ui';

/**
 * Full-screen modal to search and pick an exercise (routine editor, workouts), or create a new one
 * on the fly. Search, muscle-group filter chips and ordering work like the Progress tab's exercise
 * dropdown (shared in lib/exerciseSearch): most recently done first, then most done, then
 * never-done exercises by name; name matches before muscle-group matches.
 */
export function ExercisePicker(props: {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  excludeIds?: string[];
}) {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [all, setAll] = useState<ExerciseUsage[]>([]);
  const [groupsByExercise, setGroupsByExercise] = useState(new Map<string, string[]>());
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!props.visible) return;
    setQuery('');
    setGroup(null);
    listExercisesWithUsage(db).then(setAll);
    listExerciseMuscleGroupLinks(db).then((links) => setGroupsByExercise(groupsByExerciseId(links)));
  }, [props.visible, db]);

  const available = useMemo(() => {
    const exclude = new Set(props.excludeIds ?? []);
    return all.filter((e) => !exclude.has(e.id));
  }, [all, props.excludeIds]);
  const groups = useMemo(() => muscleGroupFilters(available, groupsByExercise), [available, groupsByExercise]);
  const visible = searchExercises(available, groupsByExercise, query, group);

  const name = query.trim();
  const exactMatch = all.some((e) => e.name.toLowerCase() === name.toLowerCase());

  const createAndPick = async () => {
    if (!name) return;
    const id = await createExercise(db, name, []);
    props.onPick({ id, name, muscle_groups: null, load_type: 'weight' });
  };

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: Platform.OS === 'ios' ? space.xl : 48 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: space.lg,
            paddingBottom: space.sm,
          }}
        >
          <Text style={font.h2}>Pick exercise</Text>
          <Button title="Close" variant="ghost" onPress={props.onClose} />
        </View>

        <View style={{ paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises or muscles"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            style={[font.body, { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10 }]}
          />
          {groups.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.xs }}>
              {[null, ...groups].map((g) => (
                <FilterChip key={g ?? '_all'} label={g ?? 'All'} active={group === g} onPress={() => setGroup(g)} />
              ))}
            </ScrollView>
          ) : null}
          {name !== '' && !exactMatch ? (
            <Button title={`+ Create "${name}"`} variant="secondary" onPress={createAndPick} />
          ) : null}
        </View>

        <FlatList
          data={visible}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: space.xl }}
          ListEmptyComponent={<Text style={[font.dim, { padding: space.lg, textAlign: 'center' }]}>No matches</Text>}
          renderItem={({ item: e }) => {
            const unit = e.load_type === 'level' ? 'machine level' : e.load_type === 'bodyweight' ? 'bodyweight' : null;
            return (
              <Pressable
                onPress={() => props.onPick(e)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  paddingHorizontal: space.lg,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[font.body, { fontWeight: '700' }]} numberOfLines={1}>
                    {e.name}
                  </Text>
                  {e.muscle_groups || unit ? (
                    <Text style={font.small} numberOfLines={1}>
                      {[e.muscle_groups, unit].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                {/* How often and when last done, like the Progress dropdown; blank if never */}
                {e.session_count > 0 && e.last_at != null ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[font.body, { fontVariant: ['tabular-nums'] }]}>{e.session_count}×</Text>
                    <Text style={font.small}>{formatDayMonth(e.last_at)}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
