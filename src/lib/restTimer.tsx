import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { prefs } from './prefs';

/*
 * Rest timer shared by the workout screens, so it keeps running while you move between the
 * workout overview and an exercise.
 *
 * It stores the moment rest ends (`endsAt`, epoch ms) rather than counting down, so it stays
 * correct if the app is in the background (JS timers pause there). When rest ends while the app
 * is open, the phone vibrates. There is no alert while the app is closed or the screen is off;
 * that would need notifications.
 */

export const REST_PRESETS = [60, 90, 120, 180];

interface RestTimer {
  /** Chosen rest length in seconds (remembered between workouts). */
  duration: number;
  /** Seconds left, or null when no rest is running. */
  remaining: number | null;
  start: (seconds?: number) => void;
  /** Adds (or with a negative value removes) time from a running rest. */
  adjust: (seconds: number) => void;
  stop: () => void;
  setDuration: (seconds: number) => void;
}

const RestTimerContext = createContext<RestTimer | null>(null);

export function RestTimerProvider({ children }: { children: React.ReactNode }) {
  const [duration, setDurationState] = useState(prefs.getRestSeconds);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const endsAtRef = useRef<number | null>(null);
  endsAtRef.current = endsAt;

  // Tick 4× a second while running (so the shown second flips on time), and re-check when the app
  // comes back to the foreground
  useEffect(() => {
    if (endsAt == null) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setNow(Date.now()));
    return () => {
      clearInterval(tick);
      sub.remove();
    };
  }, [endsAt]);

  // Rest over: vibrate (only if we're on time, not when returning to the app much later) and reset
  useEffect(() => {
    if (endsAt != null && now >= endsAt) {
      if (now - endsAt < 5000) Vibration.vibrate([0, 400, 200, 400, 200, 400]);
      setEndsAt(null);
    }
  }, [now, endsAt]);

  const start = useCallback(
    (seconds?: number) => {
      const s = seconds ?? duration;
      setNow(Date.now());
      setEndsAt(Date.now() + s * 1000);
    },
    [duration],
  );

  const adjust = useCallback((seconds: number) => {
    if (endsAtRef.current == null) return;
    setEndsAt(Math.max(Date.now() + 1000, endsAtRef.current + seconds * 1000));
  }, []);

  const stop = useCallback(() => setEndsAt(null), []);

  const setDuration = useCallback((seconds: number) => {
    setDurationState(seconds);
    prefs.setRestSeconds(seconds);
  }, []);

  const remaining = endsAt == null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
  const value = useMemo(
    () => ({ duration, remaining, start, adjust, stop, setDuration }),
    [duration, remaining, start, adjust, stop, setDuration],
  );
  return <RestTimerContext.Provider value={value}>{children}</RestTimerContext.Provider>;
}

export function useRestTimer(): RestTimer {
  const ctx = useContext(RestTimerContext);
  if (!ctx) throw new Error('useRestTimer must be used inside <RestTimerProvider>');
  return ctx;
}

/** 90 -> "1:30" */
export function formatSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
