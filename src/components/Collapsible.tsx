import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const OPEN_MS = 260;
const CLOSE_MS = 200;

/**
 * Content that opens and closes by animating its height, so the parent card grows smoothly and
 * whatever is below it slides along, instead of jumping in one frame.
 *
 * How: while animating, the children are laid out absolutely inside a clipped box, so they keep
 * their natural height (measured with onLayout) while the box's height animates from 0 to that.
 * The opening waits for the first non-zero measurement, so children that load data first can
 * render nothing until it's there and still get a smooth open. When closed, the children are
 * unmounted after the close animation.
 *
 * When fully open, the box goes back to normal layout (auto height, content in the flow). A fixed
 * height only follows the content through onLayout, which doesn't fire on every frame of a
 * Reanimated animation, so something animating inside (a nested Collapsible) would be clipped and
 * then jump. It also means a Collapsible that is open on its first render just shows its content,
 * with no animation and no empty first frame.
 */
export function Collapsible(props: { open: boolean; children: React.ReactNode }) {
  const { open } = props;
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [measured, setMeasured] = useState(false);
  const height = useSharedValue(0);
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!mounted || !measured) return;
    const unmount = () => {
      setMounted(false);
      setMeasured(false);
    };
    progress.value = open
      ? withTiming(1, { duration: reduceMotion ? 0 : OPEN_MS, easing: Easing.out(Easing.cubic) })
      : withTiming(0, { duration: reduceMotion ? 0 : CLOSE_MS, easing: Easing.inOut(Easing.cubic) }, (done) => {
          if (done) runOnJS(unmount)();
        });
  }, [open, mounted, measured]); // eslint-disable-line react-hooks/exhaustive-deps

  const boxStyle = useAnimatedStyle(() =>
    progress.value === 1 ? { height: 'auto' as const } : { height: height.value * progress.value },
  );
  // Content fades in over the second half of the opening, so it isn't seen squashed at the start
  const contentStyle = useAnimatedStyle(() => ({
    position: progress.value === 1 ? ('relative' as const) : ('absolute' as const),
    opacity: Math.max(0, progress.value * 2 - 1),
  }));

  if (!mounted) return null;
  return (
    <Animated.View style={[{ overflow: 'hidden' }, boxStyle]}>
      <Animated.View
        style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, contentStyle]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          height.value = h;
          if (h > 0 && !measured) setMeasured(true);
        }}
      >
        {props.children}
      </Animated.View>
    </Animated.View>
  );
}

/** A chevron that turns from pointing down (closed) to up (open), in step with Collapsible. */
export function ExpandChevron(props: { open: boolean; color: string; size?: number }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(props.open ? 1 : 0);
  useEffect(() => {
    turn.value = withTiming(props.open ? 1 : 0, {
      duration: reduceMotion ? 0 : OPEN_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [props.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={props.size ?? 18} color={props.color} />
    </Animated.View>
  );
}
