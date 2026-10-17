import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, font, radius, space } from '../theme';

/** Local midnight of the given time. Days are compared by this value. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Month calendar in the app's theme. `value` is a local-midnight timestamp (see `startOfDay`).
 * Days after `max` are disabled, so you can't log a workout in the future.
 */
export function Calendar(props: { value: number; onChange: (day: number) => void; max?: number }) {
  const selected = new Date(props.value);
  const [month, setMonth] = useState({ y: selected.getFullYear(), m: selected.getMonth() });
  const max = props.max ?? Infinity;
  const today = startOfDay(Date.now());

  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // blanks before the 1st, with weeks starting on Monday
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.y, month.m, i + 1).getTime()),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const shift = (dir: 1 | -1) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const canGoForward = new Date(month.y, month.m + 1, 1).getTime() <= max;

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <NavButton label="‹" onPress={() => shift(-1)} />
        <Text style={[font.h2, { flex: 1, textAlign: 'center' }]}>
          {first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>
        <NavButton label="›" onPress={() => shift(1)} disabled={!canGoForward} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={[font.small, { flex: 1, textAlign: 'center' }]}>
            {d}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}>
          {week.map((day, di) => {
            if (day == null) return <View key={di} style={{ flex: 1, height: 44 }} />;
            const isSel = day === props.value;
            const disabled = day > max;
            return (
              <Pressable
                key={di}
                disabled={disabled}
                onPress={() => props.onChange(day)}
                style={{
                  flex: 1,
                  height: 44,
                  margin: 2,
                  borderRadius: radius.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSel ? colors.accent : 'transparent',
                  borderWidth: day === today && !isSel ? 1 : 0,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    color: isSel ? colors.accentText : disabled ? colors.textFaint : colors.text,
                    fontWeight: isSel ? '800' : '600',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {new Date(day).getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function NavButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      hitSlop={8}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: props.disabled ? 0.3 : 1 }}
    >
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700' }}>{props.label}</Text>
    </Pressable>
  );
}
