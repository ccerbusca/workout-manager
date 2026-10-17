import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { type Colors, radius, space, type Theme, useTheme, useThemedStyles } from '../theme';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface DialogState {
  title: string;
  message?: string;
  buttons: DialogButton[];
}

let showImpl: ((d: DialogState) => void) | null = null;

/**
 * Themed replacement for React Native's Alert.alert (same call signature).
 * Requires <DialogHost /> to be mounted once at the app root.
 */
export const Dialog = {
  alert(title: string, message?: string, buttons?: DialogButton[]) {
    const d = { title, message, buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }] };
    if (showImpl) showImpl(d);
    else console.warn('DialogHost is not mounted', d);
  },
};

export function DialogHost() {
  const styles = useThemedStyles(makeStyles);
  const { colors, font } = useTheme();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    showImpl = setDialog;
    return () => {
      showImpl = null;
    };
  }, []);

  const press = (b?: DialogButton) => {
    setDialog(null);
    b?.onPress?.();
  };

  // Back button / tapping outside behaves like the cancel button
  const dismiss = () => press(dialog?.buttons.find((b) => b.style === 'cancel'));

  // Cancel goes on the left, the action on the right
  const buttons = dialog
    ? [...dialog.buttons].sort((a, b) => (a.style === 'cancel' ? -1 : 0) - (b.style === 'cancel' ? -1 : 0))
    : [];
  const stacked = buttons.length > 2;

  return (
    <Modal visible={dialog != null} transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        {/* inner Pressable swallows taps so they don't reach the backdrop */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={font.h2}>{dialog?.title}</Text>
          {dialog?.message ? <Text style={[font.dim, { lineHeight: 20 }]}>{dialog.message}</Text> : null}
          <View style={[styles.buttons, stacked && { flexDirection: 'column' }]}>
            {buttons.map((b, i) => {
              const v = variant(colors, b.style);
              return (
                <Pressable
                  key={i}
                  onPress={() => press(b)}
                  style={({ pressed }) => [
                    styles.button,
                    !stacked && { flex: 1 },
                    { backgroundColor: v.bg, borderColor: v.border },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={[styles.buttonText, { color: v.fg }]}>{b.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function variant(colors: Colors, style: DialogButton['style']) {
  switch (style) {
    case 'cancel':
      return { bg: colors.surfaceAlt, fg: colors.text, border: colors.border };
    case 'destructive':
      return { bg: colors.danger, fg: colors.dangerText, border: colors.danger };
    default:
      return { bg: colors.accent, fg: colors.accentText, border: colors.accent };
  }
}

/** Styles that depend on the theme; read them with useThemedStyles(makeStyles). */
const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.backdrop,
      justifyContent: 'center',
      padding: space.xl,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space.xl,
      gap: space.md,
    },
    buttons: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
    button: {
      paddingVertical: 14,
      paddingHorizontal: space.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      alignItems: 'center',
    },
    buttonText: { fontSize: 16, fontWeight: '700' },
  });
