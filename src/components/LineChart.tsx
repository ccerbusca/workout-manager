import React, { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../theme';

export interface ChartPoint {
  x: number; // timestamp
  y: number;
  label: string; // shown when tapped
}

/**
 * Minimal line chart drawn with react-native-svg.
 * Hand-rolled on purpose: no chart library to fight, and easy to tweak.
 * Tap a dot to see its value.
 */
export function LineChart(props: { points: ChartPoint[]; height?: number; unit?: string }) {
  const { colors, font } = useTheme();
  const { points, height = 200, unit = '' } = props;
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length === 0) return null;

  const padL = 44;
  const padR = 12;
  const padT = 16;
  const padB = 24;
  const plotW = Math.max(1, width - padL - padR);
  const plotH = height - padT - padB;

  const ys = points.map((p) => p.y);
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
  const xAt = (i: number) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - ((v - minY) / (maxY - minY)) * plotH;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(' ');

  const gridValues = [0, 0.5, 1].map((f) => minY + f * (maxY - minY));
  const sel = selected != null ? points[selected] : points[points.length - 1];

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {Math.round(sel.y * 10) / 10}
          <Text style={{ fontSize: 16, color: colors.textDim }}> {unit}</Text>
        </Text>
        <Text style={font.dim}>{sel.label}</Text>
      </View>
      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {gridValues.map((v, i) => (
              <React.Fragment key={i}>
                <Line x1={padL} x2={width - padR} y1={yAt(v)} y2={yAt(v)} stroke={colors.border} strokeWidth={1} />
                <SvgText x={padL - 6} y={yAt(v) + 4} fill={colors.textFaint} fontSize={11} textAnchor="end">
                  {Math.round(v)}
                </SvgText>
              </React.Fragment>
            ))}
            <Path d={path} stroke={colors.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
            {points.map((p, i) => {
              const isSel = selected === i || (selected == null && i === points.length - 1);
              return (
                <React.Fragment key={i}>
                  <Circle
                    cx={xAt(i)}
                    cy={yAt(p.y)}
                    r={isSel ? 6 : 3.5}
                    fill={isSel ? colors.accent : colors.bg}
                    stroke={colors.accent}
                    strokeWidth={2}
                  />
                  {/* larger invisible hit target */}
                  <Circle cx={xAt(i)} cy={yAt(p.y)} r={16} fill="transparent" onPress={() => setSelected(i)} />
                </React.Fragment>
              );
            })}
            <SvgText x={padL} y={height - 6} fill={colors.textFaint} fontSize={11} textAnchor="start">
              {points[0].label}
            </SvgText>
            {points.length > 1 && (
              <SvgText x={width - padR} y={height - 6} fill={colors.textFaint} fontSize={11} textAnchor="end">
                {points[points.length - 1].label}
              </SvgText>
            )}
          </Svg>
        )}
      </View>
    </View>
  );
}
