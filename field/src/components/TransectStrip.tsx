// The transect as a straight strip (kit `.fk-strip`): a round-capped track from start to end with distance ticks,
// the allowed band in mint, the typed point as its band mark (at the top edge when it's far off, with the real
// distance), a dashed connector down to the line, and "Did you mean?" fixes as numbered dashed mint rings (filled
// once used). Plain react-native-svg, works offline and in Expo Go.
import type { CoordBand } from '@sciworks/shared';
import { Platform } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

import { MarkShape, markColors } from './Icon';

export interface StripPoint {
  chainageM: number;
  offsetM: number;
  kind: 'typed' | 'suggestion' | 'accepted';
  band?: CoordBand;
  label?: string;
}

const W = 296;
const H = 96;
const X0 = 14;
const X1 = 282;
const LINE_Y = 66;
const TOP_Y = 16;
const BREAK_Y = 41;

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

function ticks(lengthM: number): number[] {
  const step = lengthM > 2500 ? 1000 : 500;
  const out: number[] = [];
  for (let v = 0; v < lengthM - step * 0.6; v += step) out.push(v); // keep clear of the end label
  return out;
}

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
  const { t } = useTheme();
  // SVG text uses the phone's system face; the browser preview needs it named (else it falls back to serif).
  // Tabular figures on every number (on the phone). The browser preview only needs the system face named.
  const tf = Platform.OS === 'web' ? { fontFamily: 'system-ui, -apple-system, Helvetica, Arial, sans-serif' } : { fontFeatureSettings: "'tnum'" };
  const yMaxM = toleranceM * amberMultiplier * 1.4; // further off than this is drawn at the top edge, with its real distance
  const x = (c: number) => X0 + (Math.min(Math.max(c, 0), lengthM) / Math.max(lengthM, 1)) * (X1 - X0);
  const y = (o: number) => LINE_Y - (Math.min(o, yMaxM) / yMaxM) * (LINE_Y - TOP_Y);
  const allowTop = y(toleranceM);
  const typed = points.find((p) => p.kind === 'typed');
  const fixes = points.filter((p) => p.kind !== 'typed');
  const sugIndex = (p: StripPoint) => fixes.indexOf(p) + 1;

  const typedFar = typed ? typed.offsetM > yMaxM : false;
  const anyFixMoved = fixes.some((f) => f.kind === 'accepted');

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={`Transect ${transectId}, 0 to ${thousands(lengthM)} m${typed ? `. The typed point is ${dist(typed.offsetM)} off the line.` : ''}`}>
      <Rect x={X0} y={allowTop} width={X1 - X0} height={LINE_Y - allowTop} fill={t.onFill} fillOpacity={t.name === 'night' ? 1 : 0.62} />
      <SvgText x={X0 + 11} y={allowTop - 4} fontSize={12} fontWeight="500" fill={t.onInk} {...tf}>
        allowed {Math.round(toleranceM)} m
      </SvgText>
      <Line x1={X0} y1={LINE_Y} x2={X1} y2={LINE_Y} stroke={t.track} strokeWidth={4} strokeLinecap="round" />
      {[...ticks(lengthM), lengthM].map((v) => (
        <Line key={v} x1={x(v)} y1={LINE_Y - 5} x2={x(v)} y2={LINE_Y + 5} stroke={t.ink2} strokeWidth={1.25} />
      ))}
      {ticks(lengthM).map((v) => (
        <SvgText key={`l${v}`} x={x(v)} y={H - 6} fontSize={12} fill={t.ink2} textAnchor="middle" {...tf}>
          {v === 0 ? '0' : thousands(v)}
        </SvgText>
      ))}
      <SvgText x={X1 + 2} y={H - 6} fontSize={12} fill={t.ink2} textAnchor="end" {...tf}>
        {thousands(lengthM)} m
      </SvgText>

      {typed && (
        <G>
          <Line
            x1={x(typed.chainageM)}
            y1={y(typed.offsetM) + 8}
            x2={x(typed.chainageM)}
            y2={LINE_Y - 4}
            stroke={anyFixMoved ? t.ink2 : t.offMark}
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
          {typedFar && (
            <G>
              {/* scale break: the connector is not to scale when the point is far off */}
              <Line x1={x(typed.chainageM) - 6} y1={BREAK_Y + 2} x2={x(typed.chainageM) + 6} y2={BREAK_Y - 3} stroke={t.card} strokeWidth={4} />
              <Line x1={x(typed.chainageM) - 6} y1={BREAK_Y + 0.5} x2={x(typed.chainageM) + 6} y2={BREAK_Y - 4.5} stroke={t.ink2} strokeWidth={1.25} />
              <Line x1={x(typed.chainageM) - 6} y1={BREAK_Y + 4} x2={x(typed.chainageM) + 6} y2={BREAK_Y - 1} stroke={t.ink2} strokeWidth={1.25} />
            </G>
          )}
          <MarkShape band={anyFixMoved ? 'typed' : (typed.band ?? 'red')} x={x(typed.chainageM) - 8} y={y(typed.offsetM) - 8} size={16} />
          {anyFixMoved ? (
            <SvgText x={x(typed.chainageM) + 14} y={y(typed.offsetM) + 4} fontSize={12} fill={t.ink2} {...tf}>
              as typed
            </SvgText>
          ) : (
            <>
              {typedFar && (
                <Path
                  d={`M${x(typed.chainageM) + 17} ${TOP_Y + 6}V${TOP_Y - 4}M${x(typed.chainageM) + 13} ${TOP_Y}l4-4 4 4`}
                  fill="none"
                  stroke={t.ink}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <SvgText x={x(typed.chainageM) + (typedFar ? 25 : 12)} y={y(typed.offsetM) + 4} fontSize={12} fontWeight="600" fill={t.ink} {...tf}>
                {dist(typed.offsetM)} off
              </SvgText>
              <SvgText x={x(typed.chainageM) + (typedFar ? 92 : 70)} y={y(typed.offsetM) + 4} fontSize={12} fill={t.ink2} {...tf}>
                as typed
              </SvgText>
            </>
          )}
        </G>
      )}

      {fixes.map((p) => {
        const used = p.kind === 'accepted';
        const cx = x(p.chainageM);
        const cy = Math.min(y(p.offsetM), LINE_Y - 4);
        const { glyph } = markColors('green', t);
        return (
          <G key={`${p.kind}-${p.chainageM}-${p.offsetM}`}>
            <Circle cx={cx} cy={cy} r={8} fill={used ? t.onMark : t.card} stroke={t.onMark} strokeWidth={2} strokeDasharray={used ? undefined : '3 2.5'} />
            <SvgText x={cx} y={cy + 4} fontSize={11} fontWeight="700" fill={used ? glyph : t.ink} textAnchor="middle" {...tf}>
              {used ? '' : String(sugIndex(p))}
            </SvgText>
            {used && <Path d={`M${cx - 3.6} ${cy + 0.2}l2.4 2.4 4.8-5`} fill="none" stroke={glyph} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
            {fixes.length === 1 &&
              (used ? (
                <SvgText x={cx + 13} y={cy - 6} fontSize={12} fontWeight="600" fill={t.ink} {...tf}>
                  {thousands(p.chainageM)} m along
                </SvgText>
              ) : (
                <SvgText x={cx + 13} y={cy - 6} fontSize={12} fill={t.ink2} {...tf}>
                  suggestion
                </SvgText>
              ))}
          </G>
        );
      })}
    </Svg>
  );
}
