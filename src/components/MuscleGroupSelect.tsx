import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MuscleGroup } from '../db/types';
import { radius, space, useTheme } from '../theme';
import { Collapsible, ExpandChevron } from './Collapsible';

/**
 * Multi-select dropdown for an exercise's muscle groups.
 *
 * Tapping the field opens the list inline (no modal, so it works inside a ScrollView), sliding open
 * with Collapsible; inside another Collapsible (the exercise edit card) that one grows along. The
 * text box at the top filters the list, and when no group has exactly that name, Add (or the
 * keyboard's done key) creates it in the shared list (via `onCreate`) and ticks it. The list is its
 * own scroll area capped at about five rows, so a long list doesn't stretch the page. Each row
 * toggles a group, and the list stays open until you tap the field again.
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
  const [query, setQuery] = useState('');

  const selectedNames = props.options.filter((o) => props.selected.includes(o.id)).map((o) => o.name);

  const q = query.trim().toLowerCase();
  // Names starting with the query first, then ones containing it elsewhere ("back" → Back, Lower back)
  const shown = q
    ? [
        ...props.options.filter((o) => o.name.toLowerCase().startsWith(q)),
        ...props.options.filter((o) => !o.name.toLowerCase().startsWith(q) && o.name.toLowerCase().includes(q)),
      ]
    : props.options;
  const exact = q ? props.options.find((o) => o.name.trim().toLowerCase() === q) : undefined;
  const canAdd = q !== '' && !exact;

  const toggle = (id: string) =>
    props.onChange(props.selected.includes(id) ? props.selected.filter((x) => x !== id) : [...props.selected, id]);

  const add = async () => {
    if (!canAdd) return;
    const g = await props.onCreate(query.trim());
    setQuery('');
    if (!props.selected.includes(g.id)) props.onChange([...props.selected, g.id]);
  };

  /** The keyboard's done key: add a new group, or tick an existing one with exactly that name. */
  const submit = () => {
    if (canAdd) add();
    else if (exact) {
      if (!props.selected.includes(exact.id)) props.onChange([...props.selected, exact.id]);
      setQuery('');
    }
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
        <ExpandChevron open={open} color={colors.textDim} />
      </Pressable>

      <Collapsible open={open}>
        <View style={{ paddingTop: space.xs }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                padding: space.sm,
                paddingLeft: space.md,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Ionicons name="search" size={16} color={colors.textFaint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={submit}
                placeholder="Search or add a group…"
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.accent}
                returnKeyType="done"
                submitBehavior="submit"
                style={[font.body, { flex: 1, paddingVertical: 8 }]}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textFaint} />
                </Pressable>
              ) : null}
              {canAdd ? (
                <Pressable
                  onPress={add}
                  style={({ pressed }) => ({
                    paddingHorizontal: space.md,
                    paddingVertical: 8,
                    borderRadius: radius.sm,
                    backgroundColor: colors.accent,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text style={{ color: colors.accentText, fontWeight: '700' }}>Add</Text>
                </Pressable>
              ) : null}
            </View>

            {/* nestedScrollEnabled: on Android a ScrollView inside another only scrolls with it set */}
            <ScrollView
              style={{ maxHeight: LIST_MAX_HEIGHT }}
              nestedScrollEnabled
              persistentScrollbar
              keyboardShouldPersistTaps="handled"
            >
              {shown.map((o, i) => {
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
                      borderBottomWidth: i === shown.length - 1 ? 0 : 1,
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
              {shown.length === 0 ? (
                <Text style={[font.dim, { padding: space.md }]}>
                  {q ? `No group called “${query.trim()}”. Tap Add to create it.` : 'No groups yet. Type a name to add one.'}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Collapsible>
    </View>
  );
}
