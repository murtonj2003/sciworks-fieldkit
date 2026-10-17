// The transect drawn as a straight strip: start on the left, end on the right, the tolerance band around
// the line, the typed point and any "did you mean?" points. No map library needed (works in Expo Go).
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { colors } from './ui';

export interface StripPoint {
  chainageM: number;
  offsetM: number;
  kind: 'typed' | 'suggestion' | 'accepted';
  label?: string;
}

const W = 340;
const H = 150;
const PAD_X = 16;
const LINE_Y = 118;
const TOP_Y = 22;

const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export function TransectStrip({
  lengthM,
  toleranceM,
  amberMultiplier,
  points,
  transectId,
}: {
  lengthM: number;
  toleranceM: number;
  amberMultiplier: number;
  points: StripPoint[];
  transectId: string;
}) {
  const amberM = toleranceM * amberMultiplier;
  const yMaxM = amberM * 1.4; // anything further is drawn at the top edge with its real distance
  const x = (c: number) => PAD_X + (Math.min(Math.max(c, 0), lengthM) / Math.max(lengthM, 1)) * (W - 2 * PAD_X);
  const y = (o: number) => LINE_Y - (Math.min(o, yMaxM) / yMaxM) * (LINE_Y - TOP_Y);

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={`Transect ${transectId} strip`}>
      <Rect x={PAD_X} y={y(amberM)} width={W - 2 * PAD_X} height={LINE_Y - y(amberM)} fill="#FFF1D6" />
      <Rect x={PAD_X} y={y(toleranceM)} width={W - 2 * PAD_X} height={LINE_Y - y(toleranceM)} fill="#DDF1E3" />
      <Line x1={PAD_X} y1={LINE_Y} x2={W - PAD_X} y2={LINE_Y} stroke={colors.ink} strokeWidth={4} />
      <SvgText x={PAD_X} y={H - 6} fontSize={12} fill={colors.dim}>
        start
      </SvgText>
      <SvgText x={W - PAD_X} y={H - 6} fontSize={12} fill={colors.dim} textAnchor="end">
        end · {km(lengthM)}
      </SvgText>
      <SvgText x={W / 2} y={H - 6} fontSize={12} fill={colors.dim} textAnchor="middle">
        green band = within {Math.round(toleranceM)} m
      </SvgText>
      {points.map((p, i) => {
        const px = x(p.chainageM);
        const py = y(p.offsetM);
        const clamped = p.offsetM > yMaxM;
        const stroke = p.kind === 'typed' ? colors.red : colors.green;
        return (
          <G key={i}>
            <Line x1={px} y1={LINE_Y} x2={px} y2={py} stroke={stroke} strokeWidth={1.5} strokeDasharray="4 3" />
            <Circle
              cx={px}
              cy={py}
              r={p.kind === 'typed' ? 9 : 8}
              fill={p.kind === 'suggestion' ? '#FFFFFF' : stroke}
              stroke={stroke}
              strokeWidth={3}
              strokeDasharray={p.kind === 'suggestion' ? '3 2' : undefined}
            />
            <SvgText
              x={Math.min(Math.max(px, 40), W - 40)}
              y={py - 13}
              fontSize={13}
              fontWeight="700"
              fill={stroke}
              textAnchor="middle"
            >
              {clamped ? `↑ ${km(p.offsetM)} off` : p.label ?? km(p.offsetM)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
