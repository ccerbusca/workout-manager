import React from 'react';
import { Pressable, Text } from 'react-native';
import { radius, space, useTheme } from '../theme';

/** A pill-shaped filter toggle (muscle-group filters in the exercise dropdown and picker). */
export function FilterChip(props: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: props.active }}
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
