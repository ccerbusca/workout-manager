import React, { forwardRef } from 'react';
import { KeyboardAvoidingView, ScrollView, type ScrollViewProps } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

/**
 * A ScrollView for screens with text boxes, so the keyboard never hides what you're typing.
 *
 * Android apps on SDK 57 are edge-to-edge, so the system no longer shrinks the screen when the
 * keyboard opens. KeyboardAvoidingView does that instead (on both platforms): it adds bottom padding
 * equal to the part of the screen the keyboard covers. The ScrollView then gets shorter, and Android's
 * ScrollView scrolls a focused box back into view when its size changes; iOS ScrollViews do the same.
 *
 * KeyboardAvoidingView measures itself relative to its parent, which starts below the header, while
 * the keyboard position is in screen coordinates; `keyboardVerticalOffset` = header height (including
 * the status bar) reconciles the two.
 *
 * (react-native-keyboard-controller was tried first, but on Android its provider takes over the app's
 * root window insets and left an empty strip above every native stack header.)
 */
export const KeyboardScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardScrollView(props, ref) {
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView ref={ref} keyboardShouldPersistTaps="handled" {...props} />
    </KeyboardAvoidingView>
  );
});
