import React, { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { exportBackup, importBackup } from '../src/db/repo';
import { Dialog } from '../src/components/Dialog';
import { SectionTitle } from '../src/components/ui';
import { backupFileName, fromLocalIso, parseBackup } from '../src/lib/backup';
import { pickTextFile, shareJsonFile } from '../src/lib/backupFiles';
import { formatDayMonth } from '../src/lib/format';
import { prefs } from '../src/lib/prefs';
import { radius, space, THEMES, type ThemeDef, useTheme } from '../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** App settings: theme, rest timer and backup (JSON export / import). Opened from the gear in the tab header. */
export default function SettingsScreen() {
  const { colors, font, id: themeId, setTheme } = useTheme();
  const db = useSQLiteContext();
  const [restAutoStart, setRestAutoStart] = useState(prefs.getRestAutoStart);

  const exportData = async () => {
    try {
      const data = await exportBackup(db);
      await shareJsonFile(backupFileName(Date.now()), JSON.stringify(data, null, 2));
    } catch (e) {
      Dialog.alert('Export failed', e instanceof Error ? e.message : String(e));
    }
  };

  const importData = async () => {
    let file;
    try {
      const text = await pickTextFile();
      if (text == null) return;
      file = parseBackup(JSON.parse(text));
    } catch (e) {
      Dialog.alert('Can’t read that file', e instanceof Error ? e.message : String(e));
      return;
    }
    const times = file.workouts.map((w) => fromLocalIso(w.startedAt)!).sort((a, b) => a - b);
    const range = times.length ? ` from ${formatDayMonth(times[0])} to ${formatDayMonth(times[times.length - 1])}` : '';
    const parked = file;
    Dialog.alert(
      'Import this file?',
      `${file.workouts.length} workouts${range}, ${file.exercises.length} exercises and ${file.routines?.length ?? 0} routines.\n\n` +
        'Only adds what’s missing: nothing on the phone is changed or deleted, and importing the same file again adds nothing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            try {
              const r = await importBackup(db, parked);
              Dialog.alert(
                'Import done',
                `Added ${r.workoutsAdded} workouts (${r.setsAdded} sets), ${r.exercisesAdded} new exercises and ${r.routinesAdded} routines.` +
                  (r.exercisesMatched ? ` ${r.exercisesMatched} exercises matched ones you already had.` : '') +
                  (r.workoutsSkipped ? ` ${r.workoutsSkipped} workouts were already here and were skipped.` : ''),
              );
            } catch (e) {
              Dialog.alert('Import failed', `Nothing was changed.\n\n${e instanceof Error ? e.message : String(e)}`);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl * 2 }}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <SectionTitle>Theme</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {THEMES.map((t) => (
          <ThemeSwatch key={t.id} theme={t} active={t.id === themeId} onPress={() => setTheme(t.id)} />
        ))}
      </View>

      <SectionTitle>Rest timer</SectionTitle>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          padding: space.lg,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <Ionicons name="timer-outline" size={22} color={colors.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[font.body, { fontWeight: '700' }]}>Start after each set</Text>
          <Text style={font.small}>Begins the rest countdown when you log a set. You can always start it by hand.</Text>
        </View>
        <Switch
          value={restAutoStart}
          onValueChange={(on) => {
            setRestAutoStart(on);
            prefs.setRestAutoStart(on);
          }}
          trackColor={{ false: colors.surfaceAlt, true: colors.accent }}
          thumbColor={colors.text}
          ios_backgroundColor={colors.surfaceAlt}
        />
      </View>

      <SectionTitle>Backup</SectionTitle>
      <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
        <Row
          icon="cloud-upload-outline"
          title="Export data"
          hint="Save everything to a JSON file: Drive, Files, email…"
          onPress={exportData}
        />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <Row
          icon="cloud-download-outline"
          title="Import data"
          hint="Add workouts from a JSON file, e.g. an export or converted history"
          onPress={importData}
        />
      </View>
      <Text style={[font.small, { marginTop: space.sm }]}>
        Your workouts are stored only on this phone, and uninstalling the app deletes them. Export a backup regularly
        (for example once a week) and save it to Drive or another safe place.
      </Text>

      <Text style={[font.small, { textAlign: 'center', marginTop: space.xl * 2 }]}>
        Workout Manager {Constants.expoConfig?.version ?? ''}
      </Text>
    </ScrollView>
  );
}

function Row(props: { icon: IconName; title: string; hint: string; onPress: () => void }) {
  const { colors, font } = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
      })}
    >
      <Ionicons name={props.icon} size={22} color={colors.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[font.body, { fontWeight: '700' }]}>{props.title}</Text>
        <Text style={font.small}>{props.hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

/** A tappable mini preview of a theme, drawn in that theme's own colours. */
function ThemeSwatch(props: { theme: ThemeDef; active: boolean; onPress: () => void }) {
  const { colors, font } = useTheme();
  const c = props.theme.colors;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: props.active }}
      accessibilityLabel={`${props.theme.name} theme`}
      style={({ pressed }) => ({
        width: '31.5%',
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: props.active ? colors.accent : colors.border,
        padding: 4,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {/* Preview: page background, a card with two text lines, and an accent button */}
      <View style={{ backgroundColor: c.bg, borderRadius: radius.sm, padding: 8, gap: 6 }}>
        <View style={{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 6, padding: 6, gap: 4 }}>
          <View style={{ height: 5, width: '70%', borderRadius: 3, backgroundColor: c.text }} />
          <View style={{ height: 4, width: '45%', borderRadius: 2, backgroundColor: c.textDim }} />
        </View>
        <View style={{ height: 14, borderRadius: 5, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ height: 3, width: '40%', borderRadius: 2, backgroundColor: c.accentText }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6 }}>
        {props.active ? <Ionicons name="checkmark-circle" size={14} color={colors.accent} /> : null}
        <Text style={[font.dim, { fontWeight: props.active ? '800' : '600', color: props.active ? colors.text : colors.textDim }]}>
          {props.theme.name}
        </Text>
      </View>
    </Pressable>
  );
}
