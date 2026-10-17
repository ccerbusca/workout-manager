import React, { memo, useEffect, useMemo, useState } from 'react';
import { Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { type Colors, useTheme } from '../theme';

export interface ChartPoint {
  x: number; // timestamp
  y: number;
  label: string; // shown when tapped
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

const PAD = { l: 44, r: 12, t: 16, b: 24 };
const DRAW_MS = 600;

interface Geometry {
  coords: { x: number; y: number }[];
  path: string;
  /** Total length of the polyline, for the draw-in animation (straight segments, so exact). */
  length: number;
  grid: { y: number; value: number }[];
}

function computeGeometry(ys: number[], width: number, height: number): Geometry {
  const plotW = Math.max(1, width - PAD.l - PAD.r);
  const plotH = height - PAD.t - PAD.b;
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const spanY = maxY - minY;
  minY -= spanY * 0.1;
  maxY += spanY * 0.1;

  // Evenly spaced by session (not by date) so clustered workouts stay readable.
  const xAt = (i: number) => PAD.l + (ys.length === 1 ? plotW / 2 : (i / (ys.length - 1)) * plotW);
  const yAt = (v: number) => PAD.t + plotH - ((v - minY) / (maxY - minY)) * plotH;

  const coords = ys.map((y, i) => ({ x: xAt(i), y: yAt(y) }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  let length = 0;
  for (let i = 1; i < coords.length; i++) length += Math.hypot(coords[i].x - coords[i - 1].x, coords[i].y - coords[i - 1].y);
  const grid = [0, 0.5, 1].map((f) => {
    const value = minY + f * (maxY - minY);
    return { y: yAt(value), value };
  });
  return { coords, path, length, grid };
}

/**
 * Line chart drawn with react-native-svg (hand-rolled on purpose: no chart library to fight).
 *
 * - Geometry is computed once per data/size change, and the static layer (grid, line, dots, labels)
 *   is memoised, so selecting a point only redraws the highlight and the value above the chart.
 * - "Same data" means same values, not same array: the Progress screen rebuilds `points` on every
 *   render, so changes are detected by a content signature.
 * - When the data changes (other exercise, metric or unit), the line draws itself in from left to
 *   right and the dots fade in after it. Skipped when the OS "reduce motion" setting is on.
 * - One touch area picks the nearest session; drag along the chart to scrub through sessions.
 */
export function LineChart(props: { points: ChartPoint[]; height?: number; unit?: string }) {
  const { colors, font } = useTheme();
  const { points, height = 200, unit = '' } = props;
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();

  const signature = points.map((p) => `${p.x}:${p.y}`).join('|');
  // Keyed on `signature` on purpose (see above), not on the `points` array
  const ys = useMemo(() => points.map((p) => p.y), [signature]);
  const geo = useMemo(() => (width > 0 && ys.length ? computeGeometry(ys, width, height) : null), [ys, width, height]);

  // A new data set clears the selection (the old index may not exist, or mean something else)
  useEffect(() => setSelected(null), [signature]);

  // Draw-in animation, restarted whenever the data set changes
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, { duration: DRAW_MS, easing: Easing.out(Easing.cubic) });
  }, [signature, reduceMotion, progress]);

  if (points.length === 0) return null;

  // The reset above runs after this render, so a stale index from the previous data can still be
  // here for one frame; fall back to the latest session instead of reading past the end
  const selIndex = selected != null && selected < points.length ? selected : points.length - 1;
  const sel = points[selIndex];

  // Nearest session to the finger (points are evenly spaced, so this is just a rounding)
  const pick = (e: GestureResponderEvent) => {
    if (!geo || points.length === 0) return;
    const plotW = Math.max(1, width - PAD.l - PAD.r);
    const f = (e.nativeEvent.locationX - PAD.l) / plotW;
    const i = points.length === 1 ? 0 : Math.round(f * (points.length - 1));
    const clamped = Math.max(0, Math.min(points.length - 1, i));
    if (clamped !== selected) setSelected(clamped);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {Math.round(sel.y * 10) / 10}
          <Text style={{ fontSize: 16, color: colors.textDim }}> {unit}</Text>
        </Text>
        <Text style={font.dim}>{sel.label}</Text>
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height }}
        // Tap or drag to pick a session. A vertical drag is handed back to the page scroll.
        onStartShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        onResponderTerminationRequest={() => true}
      >
        {geo ? (
          <Svg width={width} height={height}>
            <ChartBase
              geo={geo}
              colors={colors}
              width={width}
              height={height}
              firstLabel={points[0].label}
              lastLabel={points.length > 1 ? points[points.length - 1].label : null}
              progress={progress}
            />
            {/* The only part that changes on selection */}
            <Circle
              cx={geo.coords[selIndex].x}
              cy={geo.coords[selIndex].y}
              r={6}
              fill={colors.accent}
              stroke={colors.accent}
              strokeWidth={2}
            />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

/** Grid, axis labels, the (animated) line and the hollow dots. Memoised: unaffected by selection. */
const ChartBase = memo(function ChartBase(props: {
  geo: Geometry;
  colors: Colors;
  width: number;
  height: number;
  firstLabel: string;
  lastLabel: string | null;
  progress: SharedValue<number>;
}) {
  const { geo, colors, width, height, progress } = props;
  // With many sessions, smaller dots keep the line readable
  const dotR = geo.coords.length > 30 ? 2 : 3.5;

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: geo.length * (1 - progress.value),
  }));
  // Dots fade in over the last third of the line animation
  const dotsProps = useAnimatedProps(() => ({
    opacity: Math.max(0, (progress.value - 0.66) / 0.34),
  }));

  return (
    <>
      {geo.grid.map((g, i) => (
        <React.Fragment key={i}>
          <Line x1={PAD.l} x2={width - PAD.r} y1={g.y} y2={g.y} stroke={colors.border} strokeWidth={1} />
          <SvgText x={PAD.l - 6} y={g.y + 4} fill={colors.textFaint} fontSize={11} textAnchor="end">
            {Math.round(g.value)}
          </SvgText>
        </React.Fragment>
      ))}
      <AnimatedPath
        d={geo.path}
        stroke={colors.accent}
        strokeWidth={2.5}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray={[geo.length + 1, geo.length + 1]}
        animatedProps={lineProps}
      />
      <AnimatedG animatedProps={dotsProps}>
        {geo.coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={dotR} fill={colors.bg} stroke={colors.accent} strokeWidth={2} />
        ))}
      </AnimatedG>
      <SvgText x={PAD.l} y={height - 6} fill={colors.textFaint} fontSize={11} textAnchor="start">
        {props.firstLabel}
      </SvgText>
      {props.lastLabel != null ? (
        <SvgText x={width - PAD.r} y={height - 6} fill={colors.textFaint} fontSize={11} textAnchor="end">
          {props.lastLabel}
        </SvgText>
      ) : null}
    </>
  );
});

