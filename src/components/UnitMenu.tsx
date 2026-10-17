import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { LoadType } from '../db/types';
import { radius, space, useTheme } from '../theme';

/**
 * Pop-up for switching an exercise between kg and machine levels.
 *
 * It opens on long-press, just below the pressed chip. The finger is still down at that point, so the
 * caller forwards the same touch's move/end events (`hitTest`) and the user can slide onto an
 * option and lift to pick it. Lifting without hovering an option leaves the menu open for a tap.
 *
 * All coordinates are page coordinates (`nativeEvent.pageX/pageY`), which is what touch events
 * report. `origin` is the overlay container's own page position, used to place the menu inside it.
 */

export interface UnitMenuState {
  current: LoadType;
  /** Page x of the long-press; the menu is centred on it. */
  x: number;
  /** Page y of the pressed chip's bottom edge; the menu opens just below it. */
  y: number;
}

const OPTIONS: { value: LoadType; label: string }[] = [
  { value: 'weight', label: 'Weight (kg)' },
  { value: 'level', label: 'Machine level' },
];

// 40% larger than the original 132×52 / 14pt, for easy hitting mid-set.
// Two of them can be wider than a narrow phone, so the width shrinks to fit the screen.
const OPT_W = 185;
const OPT_H = 73;
const FONT_SIZE = 20;
const GAP = space.sm;
const DROP = space.sm; // gap between the chip's bottom edge and the menu
const SLACK = 12; // hit area beyond each option's edges

/** Page-coordinate rectangles of each option, given where the menu was opened. */
function layout(menu: UnitMenuState, screenWidth: number) {
  const w = Math.min(OPT_W, (screenWidth - 2 * space.sm - GAP) / 2);
  const width = w * 2 + GAP;
  const left = Math.min(Math.max(menu.x - width / 2, space.sm), screenWidth - width - space.sm);
  // The chips sit at the top of the screen, so the menu always drops down below the pressed chip
  const top = menu.y + DROP;
  return OPTIONS.map((o, i) => ({ ...o, left: left + i * (w + GAP), top, w }));
}

export function unitMenuHitTest(
  menu: UnitMenuState,
  screenWidth: number,
  pageX: number,
  pageY: number,
): LoadType | null {
  const hit = layout(menu, screenWidth).find(
    (r) =>
      pageX >= r.left - SLACK &&
      pageX <= r.left + r.w + SLACK &&
      pageY >= r.top - SLACK &&
      pageY <= r.top + OPT_H + SLACK,
  );
  return hit?.value ?? null;
}

export function UnitMenu(props: {
  menu: UnitMenuState;
  origin: { x: number; y: number };
  screenWidth: number;
  hover: LoadType | null;
  onPick: (v: LoadType) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const rects = layout(props.menu, props.screenWidth);
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Pressable
        onPress={props.onClose}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.backdrop }}
      />
      {rects.map((r) => {
        const hovered = props.hover === r.value;
        const current = props.menu.current === r.value;
        return (
          <Pressable
            key={r.value}
            onPress={() => props.onPick(r.value)}
            style={{
              position: 'absolute',
              left: r.left - props.origin.x,
              top: r.top - props.origin.y,
              width: r.w,
              height: OPT_H,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: hovered || current ? colors.accent : colors.border,
              backgroundColor: hovered ? colors.accent : colors.surfaceAlt,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: hovered ? 1.06 : 1 }],
            }}
          >
            <Text style={{ color: hovered ? colors.accentText : colors.text, fontWeight: '700', fontSize: FONT_SIZE }}>
              {current ? '✓ ' : ''}
              {r.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
