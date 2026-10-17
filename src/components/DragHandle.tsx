import React from 'react';
import { View } from 'react-native';
import Sortable from 'react-native-sortables';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

/**
 * The ≡ grip used to drag an item in a `<Sortable.Grid customHandle>`. Only this area starts a
 * drag, so taps and scrolling elsewhere on the item behave normally.
 */
export function DragHandle() {
  const { colors } = useTheme();
  return (
    <Sortable.Handle>
      <View
        accessibilityLabel="Drag to reorder"
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}
      >
        <Ionicons name="reorder-three" size={26} color={colors.textFaint} />
      </View>
    </Sortable.Handle>
  );
}
