import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { MuscleGroup } from '../db/types';
import { radius, space, useTheme } from '../theme';

/**
 * Multi-select dropdown for an exercise's muscle groups.
 *
 * Tapping the field opens the list inline (no modal, so it works inside a ScrollView). The list is
 * its own scroll area capped at about five rows, so a long list doesn't stretch the page. Each row
 * toggles a group, and the list stays open until you tap the field again. "Add new" stays pinned
 * below the list; it creates a group in the shared list (via `onCreate`) and ticks it.
 */
/** About five rows (each ~47 px); the rest scrolls inside the list. */
const LIST_MAX_HEIGHT = 240;

export function MuscleGroupSelect(props: {
  options: MuscleGroup[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** Persists a new group and returns it; it then shows up for every exercise. */
  onCreate: (name: string) => Promise<MuscleGroup>;
}) {
  const { colors, font } = useTheme();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const selectedNames = props.options.filter((o) => props.selected.includes(o.id)).map((o) => o.name);

  const toggle = (id: string) =>
    props.onChange(props.selected.includes(id) ? props.selected.filter((x) => x !== id) : [...props.selected, id]);

  const add = async () => {
    if (!newName.trim()) return;
    const g = await props.onCreate(newName);
    setNewName('');
    if (!props.selected.includes(g.id)) props.onChange([...props.selected, g.id]);
  };

  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: open ? colors.accent : colors.border,
          borderRadius: radius.md,
          paddingHorizontal: space.md,
          paddingVertical: 12,
        }}
      >
        <Text style={[font.body, { flex: 1, color: selectedNames.length ? colors.text : colors.textFaint }]} numberOfLines={1}>
          {selectedNames.length ? selectedNames.join(', ') : 'Muscle groups (optional)'}
        </Text>
        <Text style={{ color: colors.textDim, fontSize: 12 }}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open ? (
        <View
          style={{
            marginTop: space.xs,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          }}
        >
          {/* nestedScrollEnabled: on Android a ScrollView inside another only scrolls with it set */}
          <ScrollView
            style={{ maxHeight: LIST_MAX_HEIGHT }}
            nestedScrollEnabled
            persistentScrollbar
            keyboardShouldPersistTaps="handled"
          >
            {props.options.map((o, i) => {
              const on = props.selected.includes(o.id);
              return (
                <Pressable
                  key={o.id}
                  onPress={() => toggle(o.id)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingHorizontal: space.md,
                    paddingVertical: 12,
                    borderBottomWidth: i === props.options.length - 1 ? 0 : 1,
                    borderBottomColor: colors.border,
                    backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                  })}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      borderWidth: 2,
                      borderColor: on ? colors.accent : colors.textFaint,
                      backgroundColor: on ? colors.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {on ? <Text style={{ color: colors.accentText, fontWeight: '900', fontSize: 13 }}>✓</Text> : null}
                  </View>
                  <Text style={font.body}>{o.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              padding: space.sm,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <TextInput
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={add}
              placeholder="Add new group…"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.accent}
              returnKeyType="done"
              style={[font.body, { flex: 1, paddingHorizontal: space.sm, paddingVertical: 8 }]}
            />
            <Pressable
              onPress={add}
              disabled={!newName.trim()}
              style={{
                paddingHorizontal: space.md,
                paddingVertical: 8,
                borderRadius: radius.sm,
                backgroundColor: colors.accent,
                opacity: newName.trim() ? 1 : 0.4,
              }}
            >
              <Text style={{ color: colors.accentText, fontWeight: '700' }}>Add</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
