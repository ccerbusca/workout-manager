import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Dialog } from '../../src/components/Dialog';
import { router, useFocusEffect } from 'expo-router';
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
import { Collapsible, ExpandChevron } from '../../src/components/Collapsible';
import { ExerciseDetails } from '../../src/components/ExerciseDetails';
import { MuscleGroupSelect } from '../../src/components/MuscleGroupSelect';
import { Button, Card, Field, SectionTitle } from '../../src/components/ui';
import { space, useTheme } from '../../src/theme';
import { KeyboardScrollView } from '../../src/components/KeyboardScrollView';
import { prefs } from '../../src/lib/prefs';

const OTHER = 'Other';
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/*
 * Rendering: the list can hold ~100 cards (an exercise appears under each of its groups), each with
 * a few Reanimated hooks, so re-rendering all of them on every tap or keystroke was noticeably slow.
 * The cards are memoized (ExerciseCard) and get only stable props: plain values, and callbacks that
 * never change (useCallback with functional state updates). Form state lives in the component that
 * owns the form (AddExerciseCard, and the edit fields inside ExerciseCard), so typing re-renders
 * only that component. Opening a card re-renders the screen plus the one or two cards that changed.
 */

export default function ExercisesScreen() {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [items, setItems] = useState<Exercise[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [links, setLinks] = useState<{ exercise_id: string; name: string }[]>([]);
  // An exercise can be listed under several groups, so expanding and editing are keyed by
  // "<group>|<exercise id>" to open the card only where it was tapped
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Muscle-group sections folded away (by name), remembered on the device
  const [collapsed, setCollapsed] = useState<string[]>(() => prefs.getCollapsedGroups());

  const toggleSection = (group: string) => {
    const closing = !collapsed.includes(group);
    setCollapsed(closing ? [...collapsed, group] : collapsed.filter((x) => x !== group));
    // Collapsing a group also closes the card open in it, so it doesn't reappear open
    if (closing) {
      const notInGroup = (key: string | null) => (key?.startsWith(`${group}|`) ? null : key);
      setExpandedKey(notInGroup);
      setEditingKey(notInGroup);
    }
  };

  // Saved in an effect rather than in the tap handler: the write is synchronous, and React runs the
  // sections' Collapsible effects (which start the animation) before this parent effect
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    prefs.setCollapsedGroups(collapsed);
  }, [collapsed]);

  const load = useCallback(() => {
    listExercises(db).then(setItems);
    listMuscleGroups(db).then(setMuscleGroups);
    listExerciseMuscleGroupLinks(db).then(setLinks);
  }, [db]);
  useFocusEffect(load);

  /** Saves a new group to the shared list, so it's offered for every exercise from now on. */
  const addMuscleGroup = useCallback(
    async (groupName: string) => {
      const g = await createMuscleGroup(db, groupName);
      setMuscleGroups(await listMuscleGroups(db));
      return g;
    },
    [db],
  );

  // Card callbacks: stable for the screen's lifetime, so they never defeat ExerciseCard's memo
  const toggle = useCallback((key: string) => {
    setEditingKey(null);
    setExpandedKey((cur) => (cur === key ? null : key));
  }, []);
  const startEdit = useCallback((key: string) => setEditingKey(key), []);
  const cancelEdit = useCallback(() => setEditingKey(null), []);
  const saved = useCallback(
    (openKey: string) => {
      setEditingKey(null);
      setExpandedKey(openKey);
      load();
    },
    [load],
  );
  const remove = useCallback(
    (e: Exercise) => {
      Dialog.alert('Delete exercise?', `"${e.name}" will be removed from routines. Logged history is kept.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteExercise(db, e.id);
            setEditingKey(null);
            setExpandedKey(null);
            load();
          },
        },
      ]);
    },
    [db, load],
  );
  const seeProgress = useCallback((exerciseId: string) => {
    router.navigate({ pathname: '/progress', params: { exerciseId, at: String(Date.now()) } });
  }, []);

  // Group by muscle group for a scannable list; an exercise appears under each of its groups.
  // Memoized so each exercise's group-name array stays the same object between renders.
  const { groupNamesByExercise, sections } = useMemo(() => {
    const names = new Map<string, string[]>();
    for (const l of links) names.set(l.exercise_id, [...(names.get(l.exercise_id) ?? []), l.name]);
    const groups = new Map<string, Exercise[]>();
    for (const e of items) {
      for (const key of names.get(e.id) ?? [OTHER]) groups.set(key, [...(groups.get(key) ?? []), e]);
    }
    const sorted = [...groups.entries()].sort(([a], [b]) => (a === OTHER ? 1 : b === OTHER ? -1 : byName(a, b)));
    return { groupNamesByExercise: names, sections: sorted };
  }, [items, links]);

  return (
    <KeyboardScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
      <AddExerciseCard muscleGroups={muscleGroups} onCreateGroup={addMuscleGroup} onAdded={load} />

      {sections.map(([g, list]) => (
        <View key={g}>
          <Pressable onPress={() => toggleSection(g)}>
            <SectionTitle
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={font.small}>{list.length}</Text>
                  <ExpandChevron open={!collapsed.includes(g)} color={colors.textFaint} />
                </View>
              }
            >
              {g}
            </SectionTitle>
          </Pressable>
          <Collapsible open={!collapsed.includes(g)}>
            <View style={{ gap: space.sm }}>
              {list.map((e) => {
                const key = `${g}|${e.id}`;
                return (
                  <ExerciseCard
                    key={e.id}
                    cardKey={key}
                    exercise={e}
                    groupNames={groupNamesByExercise.get(e.id) ?? NO_GROUPS}
                    muscleGroups={muscleGroups}
                    expanded={expandedKey === key}
                    editing={editingKey === key}
                    reloadKey={items}
                    onToggle={toggle}
                    onStartEdit={startEdit}
                    onCancelEdit={cancelEdit}
                    onSaved={saved}
                    onDelete={remove}
                    onSeeProgress={seeProgress}
                    onCreateGroup={addMuscleGroup}
                  />
                );
              })}
            </View>
          </Collapsible>
        </View>
      ))}
    </KeyboardScrollView>
  );
}

const NO_GROUPS: string[] = [];

/**
 * "New exercise": a one-line button styled like the exercise cards, which slides open into the
 * form. Its own component so typing in it doesn't re-render the list.
 */
function AddExerciseCard(props: {
  muscleGroups: MuscleGroup[];
  onCreateGroup: (name: string) => Promise<MuscleGroup>;
  onAdded: () => void;
}) {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const close = () => {
    setOpen(false);
    setName('');
    setGroupIds([]);
  };

  const add = async () => {
    if (!name.trim()) return;
    await createExercise(db, name, groupIds);
    close();
    props.onAdded();
  };

  return (
    <Card style={[{ paddingVertical: space.md }, open && { borderColor: colors.accent }]}>
      <Pressable
        onPress={() => (open ? close() : setOpen(true))}
        hitSlop={{ top: space.md, bottom: space.md }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
      >
        <Ionicons name="add" size={20} color={colors.accent} />
        <Text style={[font.body, { flex: 1, color: colors.accent, fontWeight: '700' }]}>New exercise</Text>
        <ExpandChevron open={open} color={colors.textFaint} />
      </Pressable>
      <Collapsible open={open}>
        <View style={{ gap: space.sm, paddingTop: space.md }}>
          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: space.xs }} />
          <Field placeholder="Name, e.g. Hip Thrust" value={name} onChangeText={setName} />
          <MuscleGroupSelect options={props.muscleGroups} selected={groupIds} onChange={setGroupIds} onCreate={props.onCreateGroup} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Add" onPress={add} disabled={!name.trim()} style={{ flex: 1 }} />
            <Button title="Cancel" variant="secondary" onPress={close} style={{ flex: 1 }} />
          </View>
        </View>
      </Collapsible>
    </Card>
  );
}

/**
 * One exercise in the list: a header that expands to the details, which swap for the edit form
 * in the same card (the details fold away while the form opens). Memoized; see the note at the top.
 */
const ExerciseCard = memo(function ExerciseCard(props: {
  cardKey: string;
  exercise: Exercise;
  groupNames: string[];
  muscleGroups: MuscleGroup[];
  expanded: boolean;
  editing: boolean;
  reloadKey: unknown;
  onToggle: (key: string) => void;
  onStartEdit: (key: string) => void;
  onCancelEdit: () => void;
  /** Called after saving, with the key to keep the card open under (its groups may have changed). */
  onSaved: (openKey: string) => void;
  onDelete: (e: Exercise) => void;
  onSeeProgress: (exerciseId: string) => void;
  onCreateGroup: (name: string) => Promise<MuscleGroup>;
}) {
  const { cardKey, exercise: e, expanded, editing } = props;
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [editName, setEditName] = useState('');
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);
  const active = expanded || editing;

  const startEdit = async () => {
    // Load first, then open, so the form never shows stale values
    const ids = await getExerciseMuscleGroupIds(db, e.id);
    setEditName(e.name);
    setEditGroupIds(ids);
    props.onStartEdit(cardKey);
  };

  const save = async () => {
    if (!editName.trim()) return;
    await updateExercise(db, e.id, editName, editGroupIds);
    // The exercise may now be listed under other groups; keep it open under the first of them
    const names = props.muscleGroups.filter((g) => editGroupIds.includes(g.id)).map((g) => g.name).sort(byName);
    props.onSaved(`${names[0] ?? OTHER}|${e.id}`);
  };

  return (
    <Card style={[{ paddingVertical: space.md }, active && { borderColor: colors.accent }]}>
      <Pressable
        onPress={() => props.onToggle(cardKey)}
        hitSlop={{ top: space.md, bottom: space.md }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
      >
        <Text style={[font.body, { flex: 1 }, active && { fontWeight: '700' }]}>{e.name}</Text>
        <ExpandChevron open={active} color={colors.textFaint} />
      </Pressable>
      <Collapsible open={expanded && !editing}>
        <ExerciseDetails
          exercise={e}
          muscleGroups={props.groupNames}
          reloadKey={props.reloadKey}
          onEdit={startEdit}
          onSeeProgress={() => props.onSeeProgress(e.id)}
        />
      </Collapsible>
      <Collapsible open={editing}>
        <View style={{ gap: space.sm, paddingTop: space.md }}>
          <View style={{ height: 1, backgroundColor: colors.border, marginBottom: space.xs }} />
          <Field value={editName} onChangeText={setEditName} placeholder="Name" />
          <MuscleGroupSelect
            options={props.muscleGroups}
            selected={editGroupIds}
            onChange={setEditGroupIds}
            onCreate={props.onCreateGroup}
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Save" onPress={save} style={{ flex: 1 }} />
            <Button title="Cancel" variant="secondary" onPress={props.onCancelEdit} style={{ flex: 1 }} />
          </View>
          <Button title="Delete exercise" variant="danger" onPress={() => props.onDelete(e)} />
        </View>
      </Collapsible>
    </Card>
  );
});
