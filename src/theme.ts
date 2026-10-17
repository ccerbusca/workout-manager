import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Storage } from 'expo-sqlite/kv-store';

/*
 * Design tokens and theming.
 *
 * Colours come from the active theme via `useTheme()`; spacing and radii are the same in every
 * theme and stay plain constants. The chosen theme is saved in expo-sqlite's key-value store
 * (a small separate store, not the workouts database), read synchronously at startup so the
 * first frame already uses it.
 */

export interface Colors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  /** Text/icons drawn on top of `accent`. */
  accentText: string;
  danger: string;
  /** Text on a solid `danger` button. */
  dangerText: string;
  success: string;
  /** Dimmed overlay behind dialogs and pop-ups. */
  backdrop: string;
}

export type ThemeId = 'lime' | 'purple' | 'ocean' | 'ember' | 'light';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  dark: boolean;
  colors: Colors;
}

const darkBase = { danger: '#FF5D5D', dangerText: '#FFFFFF', success: '#4ADE80', backdrop: 'rgba(0,0,0,0.6)' };

export const THEMES: ThemeDef[] = [
  {
    id: 'lime',
    name: 'Lime',
    dark: true,
    colors: {
      ...darkBase,
      bg: '#0F1115',
      surface: '#181B22',
      surfaceAlt: '#20242D',
      border: '#2A2F3A',
      text: '#F2F4F8',
      textDim: '#9AA3B2',
      textFaint: '#5F6878',
      accent: '#C6F432', // chalk lime
      accentText: '#0F1115',
    },
  },
  {
    id: 'purple',
    name: 'Purple',
    dark: true,
    colors: {
      ...darkBase,
      bg: '#120E1A',
      surface: '#1C1626',
      surfaceAlt: '#261E33',
      border: '#342A45',
      text: '#F3EEFB',
      textDim: '#A89BBF',
      textFaint: '#6E6283',
      accent: '#B388FF',
      accentText: '#120E1A',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    dark: true,
    colors: {
      ...darkBase,
      bg: '#0B1218',
      surface: '#13202A',
      surfaceAlt: '#1A2A36',
      border: '#243746',
      text: '#EEF5FA',
      textDim: '#93A7B6',
      textFaint: '#5A6E7D',
      accent: '#38BDF8',
      accentText: '#0B1218',
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    dark: true,
    colors: {
      ...darkBase,
      bg: '#14100E',
      surface: '#1E1815',
      surfaceAlt: '#28201C',
      border: '#3A2E28',
      text: '#FBF3EE',
      textDim: '#B5A399',
      textFaint: '#7A6A61',
      accent: '#FF8A3D',
      accentText: '#14100E',
    },
  },
  {
    id: 'light',
    name: 'Light',
    dark: false,
    colors: {
      bg: '#F6F5FA',
      surface: '#FFFFFF',
      surfaceAlt: '#ECE9F4',
      border: '#DCD7E7',
      text: '#16131F',
      textDim: '#5E5870',
      textFaint: '#8A8399',
      accent: '#7C3AED', // violet; lime/cyan don't read on white
      accentText: '#FFFFFF',
      danger: '#DC2626',
      dangerText: '#FFFFFF',
      success: '#16A34A',
      backdrop: 'rgba(22,19,31,0.4)',
    },
  },
];

export const DEFAULT_THEME: ThemeId = 'lime';

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16 };

function makeFont(c: Colors) {
  return {
    h1: { fontSize: 28, fontWeight: '800' as const, color: c.text },
    h2: { fontSize: 20, fontWeight: '700' as const, color: c.text },
    body: { fontSize: 16, color: c.text },
    dim: { fontSize: 14, color: c.textDim },
    small: { fontSize: 12, color: c.textFaint },
    num: { fontVariant: ['tabular-nums' as const] },
  };
}

export interface Theme {
  id: ThemeId;
  dark: boolean;
  colors: Colors;
  font: ReturnType<typeof makeFont>;
  setTheme: (id: ThemeId) => void;
}

const STORAGE_KEY = 'theme';

function build(id: ThemeId, setTheme: (id: ThemeId) => void): Theme {
  const def = THEMES.find((t) => t.id === id) ?? THEMES[0];
  return { id: def.id, dark: def.dark, colors: def.colors, font: makeFont(def.colors), setTheme };
}

function loadThemeId(): ThemeId {
  try {
    const saved = Storage.getItemSync(STORAGE_KEY);
    return THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

const ThemeContext = createContext<Theme>(build(DEFAULT_THEME, () => {}));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [id, setId] = useState<ThemeId>(loadThemeId);
  const setTheme = useCallback((next: ThemeId) => {
    setId(next);
    try {
      Storage.setItemSync(STORAGE_KEY, next);
    } catch {
      // Not saved: the theme still applies until the app restarts
    }
  }, []);
  const theme = useMemo(() => build(id, setTheme), [id, setTheme]);
  return React.createElement(ThemeContext.Provider, { value: theme }, children);
}

/** The active theme: `colors`, `font` presets (already coloured), `dark`, and `setTheme`. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Memoised styles built from the theme, e.g. `const styles = useThemedStyles(makeStyles)` with a
 * module-level `const makeStyles = (t: Theme) => StyleSheet.create({...})`. Rebuilt only when the
 * theme changes.
 */
export function useThemedStyles<T>(factory: (t: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
