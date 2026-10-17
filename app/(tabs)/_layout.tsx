import React from 'react';
import { router, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, type ColorValue } from 'react-native';
import { colors } from '../../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;

/** Settings entry: a plain dim gear, same colour as the inactive tab icons, so it doesn't compete with the content. */
function SettingsButton() {
  return (
    <Pressable
      onPress={() => router.push('/settings')}
      hitSlop={12}
      accessibilityLabel="Settings"
      style={({ pressed }) => ({ marginRight: 16, opacity: pressed ? 0.5 : 1 })}
    >
      <Ionicons name="settings-outline" size={20} color={colors.textFaint} />
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerRight: () => <SettingsButton />,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Train', tabBarIcon: icon('barbell-outline') }} />
      <Tabs.Screen name="routines" options={{ title: 'Routines', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="exercises" options={{ title: 'Exercises', tabBarIcon: icon('albums-outline') }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('stats-chart-outline') }} />
    </Tabs>
  );
}
