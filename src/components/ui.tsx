import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { type Colors, radius, space, type Theme, useTheme, useThemedStyles } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button(props: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { title, onPress, variant = 'primary', disabled, style, big } = props;
  const { colors } = useTheme();
  const v = buttonVariant(colors, variant);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        big && styles.buttonBig,
        { backgroundColor: v.bg, borderColor: v.border },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, big && { fontSize: 18 }, { color: v.fg }]}>{title}</Text>
    </Pressable>
  );
}

function buttonVariant(colors: Colors, variant: ButtonVariant): { bg: string; fg: string; border: string } {
  switch (variant) {
    case 'primary':
      return { bg: colors.accent, fg: colors.accentText, border: colors.accent };
    case 'secondary':
      return { bg: colors.surfaceAlt, fg: colors.text, border: colors.border };
    case 'ghost':
      return { bg: 'transparent', fg: colors.textDim, border: 'transparent' };
    case 'danger':
      return { bg: 'transparent', fg: colors.danger, border: colors.danger };
  }
}

export function Card(props: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  if (props.onPress) {
    return (
      <Pressable
        onPress={props.onPress}
        style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceAlt }, props.style]}
      >
        {props.children}
      </Pressable>
    );
  }
  return <View style={[styles.card, props.style]}>{props.children}</View>;
}

export function Field(props: TextInputProps & { label?: string }) {
  const styles = useThemedStyles(makeStyles);
  const { colors, font } = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={font.dim}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

export function SectionTitle(props: { children: React.ReactNode; right?: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{props.children}</Text>
      {props.right}
    </View>
  );
}

export function Empty(props: { title: string; hint?: string }) {
  const styles = useThemedStyles(makeStyles);
  const { colors, font } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[font.body, { color: colors.textDim, textAlign: 'center' }]}>{props.title}</Text>
      {props.hint ? <Text style={[font.small, { textAlign: 'center' }]}>{props.hint}</Text> : null}
    </View>
  );
}

export function Loading() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/** Numeric input with − / + buttons, sized for sweaty thumbs. */
export function Stepper(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  decimal?: boolean;
  /** Let − go below 0 (bodyweight assistance). Otherwise 0 is the floor. */
  allowNegative?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors, font } = useTheme();
  const { label, value, onChange, step, decimal, allowNegative } = props;
  const bump = (dir: 1 | -1) => {
    const n = Number(value.replace(',', '.')) || 0;
    const raw = Math.round((n + dir * step) * 100) / 100;
    const next = allowNegative ? raw : Math.max(0, raw);
    onChange(String(next));
  };
  return (
    <View style={{ flex: 1, gap: space.xs }}>
      <Text style={[font.small, { textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 }]}>
        {label}
      </Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => bump(-1)} style={styles.stepBtn} hitSlop={6}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChange}
          // On Android 'numeric' is the only number keyboard with a minus key
          keyboardType={allowNegative ? 'numeric' : decimal ? 'decimal-pad' : 'number-pad'}
          selectTextOnFocus
          selectionColor={colors.accent}
          style={styles.stepInput}
        />
        <Pressable onPress={() => bump(1)} style={styles.stepBtn} hitSlop={6}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Two-or-more option toggle, e.g. kg vs level. */
export function Segmented<T extends string>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.segment}>
      {props.options.map((o) => {
        const active = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => props.onChange(o.value)}
            style={[styles.segmentItem, active && { backgroundColor: colors.accent }]}
          >
            <Text style={{ color: active ? colors.accentText : colors.textDim, fontWeight: '700' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Styles that depend on the theme; read them with useThemedStyles(makeStyles). */
const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    button: {
      paddingVertical: 12,
      paddingHorizontal: space.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonBig: { paddingVertical: 16 },
    buttonText: { fontSize: 16, fontWeight: '700' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.lg,
    },
    input: {
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 16,
    },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: space.lg,
      marginBottom: space.sm,
    },
    sectionTitle: {
      color: colors.textDim,
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
    },
    segmentItem: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
    empty: { padding: space.xl, alignItems: 'center', gap: space.sm },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    stepBtn: { width: 48, height: 56, alignItems: 'center', justifyContent: 'center' },
    stepBtnText: { color: colors.accent, fontSize: 28, fontWeight: '600' },
    stepInput: {
      flex: 1,
      color: colors.text,
      fontSize: 26,
      fontWeight: '800',
      textAlign: 'center',
      paddingVertical: 8,
      fontVariant: ['tabular-nums'],
    },
  });
