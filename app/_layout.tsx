import React, { useMemo } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { migrate } from '../src/db/migrations';
import { seedIfEmpty } from '../src/db/repo';
import { ThemeProvider, useTheme } from '../src/theme';
import { DialogHost } from '../src/components/Dialog';

async function initDb(db: SQLiteDatabase) {
  await migrate(db);
  await seedIfEmpty(db);
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SQLiteProvider databaseName="workouts.db" onInit={initDb}>
        <ThemedApp />
      </SQLiteProvider>
    </ThemeProvider>
  );
}

/** Everything that reads the theme has to sit inside <ThemeProvider>, so it lives here. */
function ThemedApp() {
  const { colors, dark } = useTheme();
  // React Navigation keeps its own colours (screen background during transitions, etc.)
  const navigationTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.accent,
      },
    };
  }, [colors, dark]);

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="routine/[id]" options={{ title: 'Edit routine' }} />
        <Stack.Screen name="workout/[id]" options={{ title: 'Workout' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
      <DialogHost />
    </NavigationThemeProvider>
  );
}
