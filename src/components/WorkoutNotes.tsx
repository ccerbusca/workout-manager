import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { setWorkoutNotes } from '../db/repo';
import { radius, space, useTheme } from '../theme';

const SAVE_DELAY_MS = 700;

/**
 * Free-text note for a workout ("felt tired, shoulder tight on press"). Saves by itself shortly
 * after you stop typing, and immediately when the box loses focus or the screen closes, so there
 * is no Save button and nothing to lose.
 */
export function WorkoutNotes(props: { workoutId: string; initial: string | null }) {
  const { colors, font } = useTheme();
  const db = useSQLiteContext();
  const [text, setText] = useState(props.initial ?? '');
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved'>('idle');
  const pending = useRef<{ value: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const flush = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setWorkoutNotes(db, props.workoutId, p.value).then(() => setStatus('saved'));
  };

  // Save whatever is pending when leaving the screen
  // (flush only touches refs and stable values, so the first render's copy is fine here)
  useEffect(() => () => flush(), []);

  const onChange = (v: string) => {
    setText(v);
    setStatus('pending');
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { value: v, timer: setTimeout(flush, SAVE_DELAY_MS) };
  };

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={[font.small, { letterSpacing: 1, fontWeight: '700' }]}>NOTES</Text>
        <Text style={font.small}>{status === 'pending' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}</Text>
      </View>
      <TextInput
        value={text}
        onChangeText={onChange}
        onBlur={flush}
        multiline
        placeholder="How did it go? Anything to remember next time…"
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.accent}
        textAlignVertical="top"
        style={[
          font.body,
          {
            minHeight: 72,
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
          },
        ]}
      />
    </View>
  );
}
