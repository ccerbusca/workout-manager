import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatSeconds, REST_PRESETS, useRestTimer } from '../lib/restTimer';
import { radius, space, useTheme } from '../theme';

/** Full rest timer for the exercise screen: presets + Start when idle, countdown + controls when running. */
export function RestTimerCard() {
  const { colors, font } = useTheme();
  const t = useRestTimer();
  const running = t.remaining != null;

  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: running ? colors.accent : colors.border,
        backgroundColor: colors.surface,
        padding: space.lg,
        gap: space.md,
      }}
    >
      {running ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={[font.small, { color: colors.accent, letterSpacing: 1 }]}>REST</Text>
            <Text style={{ color: colors.text, fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
              {formatSeconds(t.remaining!)}
            </Text>
          </View>
          {/* Progress bar: shrinks as rest runs out */}
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
            <View
              style={{
                height: 6,
                width: `${Math.min(100, (t.remaining! / Math.max(t.duration, t.remaining!)) * 100)}%`,
                backgroundColor: colors.accent,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <TimerButton label="−15 s" onPress={() => t.adjust(-15)} />
            <TimerButton label="+15 s" onPress={() => t.adjust(15)} />
            <TimerButton label="Skip" onPress={t.stop} />
          </View>
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[font.small, { letterSpacing: 1 }]}>REST TIMER</Text>
            <Text style={font.small}>Vibrates when done</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {REST_PRESETS.map((s) => (
              <TimerButton key={s} label={formatSeconds(s)} active={t.duration === s} onPress={() => t.setDuration(s)} />
            ))}
          </View>
          <Pressable
            onPress={() => t.start()}
            style={({ pressed }) => ({
              paddingVertical: 12,
              borderRadius: radius.md,
              alignItems: 'center',
              backgroundColor: colors.surfaceAlt,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Start {formatSeconds(t.duration)} rest</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/** Slim bar shown on the workout overview while rest is running. */
export function RestTimerBar() {
  const { colors, font } = useTheme();
  const t = useRestTimer();
  if (t.remaining == null) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.sm,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.accent,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={[font.small, { color: colors.accent, letterSpacing: 1 }]}>REST</Text>
      <Text style={[font.h2, { flex: 1, fontVariant: ['tabular-nums'] }]}>{formatSeconds(t.remaining)}</Text>
      <Pressable onPress={() => t.adjust(15)} hitSlop={8}>
        <Text style={{ color: colors.textDim, fontWeight: '700' }}>+15 s</Text>
      </Pressable>
      <Pressable onPress={t.stop} hitSlop={8}>
        <Text style={{ color: colors.textDim, fontWeight: '700' }}>Skip</Text>
      </Pressable>
    </View>
  );
}

function TimerButton(props: { label: string; onPress: () => void; active?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => ({
        flex: 1,
        paddingVertical: 10,
        borderRadius: radius.md,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: props.active ? colors.accent : colors.border,
        backgroundColor: props.active ? colors.accent : colors.surfaceAlt,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text style={{ color: props.active ? colors.accentText : colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {props.label}
      </Text>
    </Pressable>
  );
}
