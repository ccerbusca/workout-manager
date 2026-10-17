import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

/*
 * An overlay layer at the app root, drawn above the navigator (headers and tab bar included) but in
 * the SAME native window as the screens. That's the point: a React Native Modal is a separate
 * Android window, and positions measured in the app (measureInWindow) don't line up with it, so
 * anything that must sit exactly on top of an on-screen element (like the exercise dropdown's
 * card) goes here instead.
 *
 * Usage: mount <OverlayHost /> once at the root (after the navigator). A component calls
 * `useOverlay(node)` with the node to show (or null); it's re-rendered into the host whenever it
 * changes. `useOverlayOrigin()` gives the host's window position, to convert measureInWindow values
 * into overlay coordinates.
 */

type Listener = (node: React.ReactNode) => void;
let listener: Listener | null = null;
let origin = { x: 0, y: 0, width: 0, height: 0 };
const originListeners = new Set<(o: typeof origin) => void>();

export function OverlayHost() {
  const [content, setContent] = useState<React.ReactNode>(null);
  const ref = useRef<View>(null);

  useEffect(() => {
    listener = (node) => setContent(node);
    return () => {
      listener = null;
    };
  }, []);

  return (
    <View
      ref={ref}
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={() =>
        ref.current?.measureInWindow((x, y, width, height) => {
          origin = { x, y, width, height };
          originListeners.forEach((l) => l(origin));
        })
      }
    >
      {content}
    </View>
  );
}

/** Shows `node` in the root overlay while it's non-null (and removes it on unmount). */
export function useOverlay(node: React.ReactNode) {
  // Push the latest node on every render (it closes over the caller's current state)
  useEffect(() => {
    listener?.(node);
  });
  // ...and clear the overlay when the caller unmounts
  useEffect(
    () => () => {
      listener?.(null);
    },
    [],
  );
}

/** The overlay host's position and size in the window (same coordinate system as measureInWindow). */
export function useOverlayOrigin() {
  const [o, setO] = useState(origin);
  useEffect(() => {
    originListeners.add(setO);
    setO(origin);
    return () => {
      originListeners.delete(setO);
    };
  }, []);
  return o;
}
