import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TrainedExercise } from '../db/types';
import { formatDayMonth } from '../lib/format';
import { radius, space, useTheme } from '../theme';
import { useOverlay, useOverlayOrigin } from './Overlay';

/** Below this much room under the card, the list opens upwards if there's more space there. */
const COMFORTABLE_HEIGHT = 360;
const OPEN_MS = 220;
const CLOSE_MS = 160;

interface Anchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Exercise selector for the Progress tab: a card showing the current exercise that opens a list
 * with search, muscle-group filters and every trained exercise.
 *
 * The list is drawn in the root overlay (components/Overlay.tsx), above headers and the tab bar,
 * with a dimmed backdrop. To make it read as one control rather than a pop-up, the card is redrawn
 * on top of the backdrop exactly over the real one, and the list is attached to its edge: same x and
 * width, square corners where they meet, one accent outline. It opens below the card, or above when
 * the card sits low on the screen.
 *
 * Why not a Modal: on Android a Modal is a separate window, and measureInWindow positions from the
 * app's window don't line up with it, so the redrawn card landed visibly off the real one. The
 * overlay is in the same window, so card position − overlay origin is exact.
 *
 * Animation: the backdrop fades in while the list grows out of the card's edge (scale from that
 * edge + slide + fade); closing reverses it before the overlay is removed. Skipped with reduce motion.
 */
export function ExerciseDropdown(props: {
  exercises: TrainedExercise[];
  /** Muscle group names per exercise id, for the filter chips. */
  groupsByExercise: Map<string, string[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Render as the header bar of an enclosing panel (accent-tinted, no own border) instead of a card. */
  embedded?: boolean;
}) {
  const { colors, font } = useTheme();
  const anchorRef = useRef<View>(null);
  // Non-null while the overlay is shown (including during the close animation)
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const origin = useOverlayOrigin();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

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
    anchorRef.current?.measureInWindow((x, y, w, h) => {
      setQuery('');
      setGroup(null);
      setAnchor({ x, y, w, h });
      progress.value = 0;
      progress.value = withTiming(1, { duration: reduceMotion ? 0 : OPEN_MS, easing: Easing.out(Easing.cubic) });
    });
  const close = () => {
    progress.value = withTiming(0, { duration: reduceMotion ? 0 : CLOSE_MS, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(setAnchor)(null);
    });
  };

  // The card's rectangle in overlay coordinates (both measured in the same window)
  const card = anchor ? { x: anchor.x - origin.x, y: anchor.y - origin.y, w: anchor.w, h: anchor.h } : null;

  // Android back closes the dropdown (a Modal did this by itself)
  useEffect(() => {
    if (!anchor) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [anchor]);

  // Open below the card, unless that leaves the list cramped and there's more room above
  // (on Progress the picker often sits low, under the Overview cards)
  const spaceBelow = card ? origin.height - (card.y + card.h) - insets.bottom - space.lg : 0;
  const spaceAbove = card ? card.y - insets.top - space.lg : 0;
  const openUp = card != null && spaceBelow < COMFORTABLE_HEIGHT && spaceAbove > spaceBelow;

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(
    () => ({
      opacity: progress.value,
      transform: [{ translateY: (1 - progress.value) * (openUp ? 12 : -12) }, { scaleY: 0.92 + 0.08 * progress.value }],
    }),
    [openUp],
  );

  // Corner radius of the card on the page: embedded = top of a rounded panel (top corners only)
  const pageTopRadius = radius.lg;
  const pageBottomRadius = props.embedded ? 0 : radius.lg;

  const cardContent = (isOpen: boolean) => (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        {props.embedded ? null : <Text style={font.small}>EXERCISE</Text>}
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
        <Text style={{ color: colors.accentText, fontWeight: '900', fontSize: 14 }}>{isOpen ? '▲' : '▼'}</Text>
      </View>
    </>
  );
  // Accent at 10% / 20% alpha: every theme's accent is #RRGGBB
  const tint = (strong: boolean) => `${colors.accent}${strong ? '33' : '1A'}`;

  const overlay = card ? (
    <>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.backdrop }, backdropStyle]}>
        <Pressable onPress={close} style={{ flex: 1 }} />
      </Animated.View>

      {/* The list, attached to the card's edge */}
      <View
        pointerEvents="box-none"
        style={
          openUp
            ? // From the top safe area down to the card's top edge; the list sits at the bottom
              { position: 'absolute', left: card.x, width: card.w, top: insets.top + space.lg, height: spaceAbove, justifyContent: 'flex-end' }
            : { position: 'absolute', left: card.x, width: card.w, top: card.y + card.h }
        }
      >
        <Animated.View
          style={[
            {
              // Opening up, the area above has a fixed height, so 100% works; opening down, cap it directly
              maxHeight: openUp ? '100%' : spaceBelow,
              backgroundColor: colors.surface,
              borderColor: colors.accent,
              borderWidth: 1,
              // The side touching the card has no border or rounding, so they read as one shape
              ...(openUp
                ? { borderBottomWidth: 0, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }
                : { borderTopWidth: 0, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg }),
              overflow: 'hidden',
              transformOrigin: openUp ? 'bottom' : 'top',
            },
            panelStyle,
          ]}
        >
          <View
            style={{
              padding: space.md,
              gap: space.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
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
        </Animated.View>
      </View>

      {/* The card, redrawn above the backdrop exactly over the real one; tapping it closes */}
      <Pressable
        onPress={close}
        style={{
          position: 'absolute',
          left: card.x,
          top: card.y,
          width: card.w,
          height: card.h,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.accent,
          // Square on the side the list is attached to; otherwise the page card's rounding
          borderTopLeftRadius: openUp ? 0 : pageTopRadius,
          borderTopRightRadius: openUp ? 0 : pageTopRadius,
          borderBottomLeftRadius: openUp ? pageBottomRadius : 0,
          borderBottomRightRadius: openUp ? pageBottomRadius : 0,
          // A thin divider where the card meets the list
          ...(openUp ? { borderTopColor: colors.border } : { borderBottomColor: colors.border }),
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            // 1px less than the page card's padding, which has no border on these sides
            paddingHorizontal: space.lg - 1,
            paddingVertical: space.lg - 1,
            backgroundColor: props.embedded ? tint(true) : colors.surface,
          }}
        >
          {cardContent(true)}
        </View>
      </Pressable>
    </>
  ) : null;
  useOverlay(overlay);

  return (
    <>
      <Pressable
        ref={anchorRef}
        onPress={open}
        style={({ pressed }) =>
          props.embedded
            ? {
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                padding: space.lg,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: tint(pressed || anchor != null),
              }
            : {
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                padding: space.lg,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: anchor ? colors.accent : colors.border,
                backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
              }
        }
      >
        {cardContent(anchor != null)}
      </Pressable>

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
