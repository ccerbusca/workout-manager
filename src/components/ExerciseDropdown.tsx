import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TrainedExercise } from '../db/types';
import { formatDayMonth } from '../lib/format';
import { radius, space, useTheme } from '../theme';

/**
 * Exercise selector for the Progress tab: a card showing the current exercise that drops a panel
 * down under itself with search, muscle-group filters and the full list.
 *
 * The panel is a transparent Modal so it covers everything (including the tab bar) with a dimmed
 * backdrop. It's positioned from the card's `measureInWindow`; the Modal is drawn edge to edge
 * (status/navigation bar translucent) so window coordinates and Modal coordinates line up.
 */
export function ExerciseDropdown(props: {
  exercises: TrainedExercise[];
  /** Muscle group names per exercise id, for the filter chips. */
  groupsByExercise: Map<string, string[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { colors, font } = useTheme();
  const anchorRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ y: number; h: number } | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const selected = props.exercises.find((e) => e.id === props.selectedId);

  // Filter chips: groups that trained exercises have, most common first
  const groups = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of props.exercises) for (const g of props.groupsByExercise.get(e.id) ?? []) count.set(g, (count.get(g) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
  }, [props.exercises, props.groupsByExercise]);

  const q = query.trim().toLowerCase();
  const inGroup = props.exercises.filter((e) => !group || (props.groupsByExercise.get(e.id) ?? []).includes(group));
  // Exercises whose name matches come first, then ones that only match by muscle group;
  // each part keeps the list's order (most recently done, then most-trained)
  const visible =
    q === ''
      ? inGroup
      : [
          ...inGroup.filter((e) => e.name.toLowerCase().includes(q)),
          ...inGroup.filter((e) => !e.name.toLowerCase().includes(q) && (e.muscle_groups ?? '').toLowerCase().includes(q)),
        ];

  const open = () =>
    anchorRef.current?.measureInWindow((_x, y, _w, h) => {
      setQuery('');
      setGroup(null);
      setAnchor({ y, h });
    });
  const close = () => setAnchor(null);

  const top = anchor ? anchor.y + anchor.h + space.xs : 0;
  const maxHeight = Math.max(240, screenHeight - top - insets.bottom - space.lg);

  return (
    <>
      <Pressable
        ref={anchorRef}
        onPress={open}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          padding: space.lg,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: anchor ? colors.accent : colors.border,
          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        })}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={font.small}>EXERCISE</Text>
          <Text style={font.h2} numberOfLines={1}>
            {selected?.name ?? 'Choose an exercise'}
          </Text>
          {selected ? (
            <Text style={font.dim} numberOfLines={1}>
              {[selected.muscle_groups, `${selected.session_count} session${selected.session_count === 1 ? '' : 's'}`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.accentText, fontWeight: '900', fontSize: 14 }}>{anchor ? '▲' : '▼'}</Text>
        </View>
      </Pressable>

      <Modal
        visible={anchor != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={close}
      >
        <Pressable onPress={close} style={{ flex: 1, backgroundColor: colors.backdrop }} />
        <View
          style={{
            position: 'absolute',
            top,
            left: space.lg,
            right: space.lg,
            maxHeight,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          }}
        >
          <View style={{ padding: space.md, gap: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search exercises or muscles"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.accent}
              style={[
                font.body,
                {
                  backgroundColor: colors.surfaceAlt,
                  borderRadius: radius.md,
                  paddingHorizontal: space.md,
                  paddingVertical: 10,
                },
              ]}
            />
            {groups.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs }}>
                {[null, ...groups].map((g) => (
                  <FilterChip key={g ?? '_all'} label={g ?? 'All'} active={group === g} onPress={() => setGroup(g)} />
                ))}
              </ScrollView>
            ) : null}
          </View>

          <FlatList
            data={visible}
            keyExtractor={(e) => e.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={[font.dim, { padding: space.lg, textAlign: 'center' }]}>No matches</Text>}
            renderItem={({ item: e }) => {
              const isSel = e.id === props.selectedId;
              return (
                <Pressable
                  onPress={() => {
                    props.onSelect(e.id);
                    close();
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    paddingHorizontal: space.md,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
                    borderLeftWidth: 3,
                    borderLeftColor: isSel ? colors.accent : 'transparent',
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[font.body, { fontWeight: '700', color: isSel ? colors.accent : colors.text }]} numberOfLines={1}>
                      {e.name}
                    </Text>
                    {e.muscle_groups ? (
                      <Text style={font.small} numberOfLines={1}>
                        {e.muscle_groups}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[font.body, { fontVariant: ['tabular-nums'] }]}>{e.session_count}×</Text>
                    <Text style={font.small}>{formatDayMonth(e.last_at)}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

function FilterChip(props: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingHorizontal: space.md,
        paddingVertical: 6,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: props.active ? colors.accent : colors.border,
        backgroundColor: props.active ? colors.accent : 'transparent',
      }}
    >
      <Text style={{ color: props.active ? colors.accentText : colors.textDim, fontWeight: '700', fontSize: 13 }}>
        {props.label}
      </Text>
    </Pressable>
  );
}
