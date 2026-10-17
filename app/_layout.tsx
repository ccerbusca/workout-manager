import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { migrate } from '../src/db/migrations';
import { seedIfEmpty } from '../src/db/repo';
import { colors } from '../src/theme';
import { DialogHost } from '../src/components/Dialog';

async function initDb(db: SQLiteDatabase) {
  await migrate(db);
  await seedIfEmpty(db);
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="workouts.db" onInit={initDb}>
      <StatusBar style="light" />
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
    </SQLiteProvider>
  );
}
