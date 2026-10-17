import React, { useEffect, useState } from 'react';
import { AppState, Text, type StyleProp, type TextStyle } from 'react-native';
import { formatDuration } from '../lib/format';

/**
 * Milliseconds until `formatDuration(startedAt, now)` shows a different value. It rounds to whole
 * minutes, so the shown value changes when the elapsed time crosses a half minute (e.g. 2:30 → "3m").
 */
export function msUntilNextMinuteFlip(startedAt: number, now: number): number {
  const elapsed = Math.max(0, now - startedAt);
  const shown = Math.round(elapsed / 60_000);
  return (shown + 0.5) * 60_000 - elapsed;
}

/**
 * Live "elapsed since start" text, e.g. "24m" or "1h 5m".
 *
 * Instead of polling, it sets one timer for the exact moment the shown minute changes, then the
 * next, and so on. It also refreshes when the app returns to the foreground (timers don't run in
 * the background). Only this text re-renders, not the screen around it.
 */
export function ElapsedTime(props: { startedAt: number; style?: StyleProp<TextStyle>; suffix?: string }) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    // A few ms late so the rounding has definitely flipped when we re-render
    const t = setTimeout(() => setNow(Date.now()), msUntilNextMinuteFlip(props.startedAt, now) + 50);
    return () => clearTimeout(t);
  }, [props.startedAt, now]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setNow(Date.now()));
    return () => sub.remove();
  }, []);

  return (
    <Text style={props.style}>
      {formatDuration(props.startedAt, now)}
      {props.suffix ?? ''}
    </Text>
  );
}
