// Line icons and band marks from the kit sprite (sprite.ts), drawn with react-native-svg. No emoji, no ✓ ⚠ ✗.
import type { CoordBand } from '@sciworks/shared';
import { Circle, G, Path, Rect, SvgXml } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import type { Tokens } from '@/theme/theme';

import { ICONS, MARKS, type IconName, type MarkName } from './sprite';

export function Icon({ name, size = 20, color, strokeWidth }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const { t } = useTheme();
  const sw = strokeWidth ?? (size >= 24 ? 2 : 1.75);
  const xml = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color ?? t.ink} />;
}

export type Band = CoordBand | 'typed' | 'none';

const MARK_OF: Record<Band, MarkName> = { green: 'on', amber: 'near', red: 'off', 'outside-bbox': 'outside', typed: 'typed', none: 'none' };

/** Colours of a band mark: the shape colour and the glyph cut into it. `onSolid` = drawn on the solid red block. */
export function markColors(band: Band, t: Tokens, onSolid = false): { color: string; glyph: string } {
  switch (band) {
    case 'green':
      return { color: t.onMark, glyph: t.onGlyph };
    case 'amber':
      return { color: t.nearMark, glyph: t.nearGlyph };
    case 'red':
      return onSolid ? { color: t.offInk, glyph: t.offFill } : { color: t.offMark, glyph: t.offGlyph };
    case 'outside-bbox':
      return { color: t.offMark, glyph: 'transparent' };
    default:
      return { color: t.ink2, glyph: 'transparent' };
  }
}

/** The band shape: circle (on) · triangle (near) · diamond (off) · hollow diamond (outside) · dashed diamond (typed). */
export function BandMarker({ band, size = 20, onSolid }: { band: Band; size?: number; onSolid?: boolean }) {
  const { t } = useTheme();
  const { color, glyph } = markColors(band, t, onSolid);
  const inner = MARKS[MARK_OF[band]].replace(/GLYPH/g, glyph).replace(/HOLLOW/g, 'transparent');
  return <SvgXml xml={`<svg viewBox="0 0 20 20">${inner}</svg>`} width={size} height={size} color={color} />;
}

/** The kit's words for each band (DESIGN-HANDOFF §1.3). */
export const BAND_WORD: Record<CoordBand, string> = {
  green: 'On the line',
  amber: 'Near the line',
  red: 'Off the line',
  'outside-bbox': 'Outside the project area',
};

/** The same band shapes as BandMarker, drawn as SVG children for use inside another <Svg> (the strip, the map),
 * where nesting a second SVG root is unreliable on Android. 20-grid, placed at (x, y) and scaled to `size`. */
export function MarkShape({ band, x, y, size = 16, tokens }: { band: Band; x: number; y: number; size?: number; tokens?: Tokens }) {
  const { t: theme } = useTheme();
  // Over a satellite picture the marks keep their day colours (the night tints wash out on a white outline).
  const t = tokens ?? theme;
  const { color, glyph } = markColors(band, t);
  const k = size / 20;
  const g = { fill: 'none', stroke: glyph, strokeWidth: 2.1, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <G transform={`translate(${x} ${y}) scale(${k})`}>
      {band === 'green' && (
        <>
          <Circle cx={10} cy={10} r={9} fill={color} />
          <Path d="M6 10.3l2.7 2.7 5.3-5.6" {...g} />
        </>
      )}
      {band === 'amber' && (
        <>
          <Path fill={color} d="M8.7 2.2a1.5 1.5 0 0 1 2.6 0l8 14.3a1.5 1.5 0 0 1-1.3 2.2H2a1.5 1.5 0 0 1-1.3-2.2z" />
          <Path d="M10 7.4v4.4" {...g} />
          <Circle cx={10} cy={15} r={1.25} fill={glyph} />
        </>
      )}
      {band === 'red' && (
        <>
          <Rect x={3.6} y={3.6} width={12.8} height={12.8} rx={2.2} transform="rotate(45 10 10)" fill={color} />
          <Path d="M7.6 7.6l4.8 4.8M12.4 7.6l-4.8 4.8" {...g} />
        </>
      )}
      {band === 'outside-bbox' && (
        <>
          <Rect x={4.3} y={4.3} width={11.4} height={11.4} rx={1.8} transform="rotate(45 10 10)" fill="none" stroke={color} strokeWidth={2} />
          <Path d="M8 8l4 4M12 8l-4 4" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        </>
      )}
      {(band === 'typed' || band === 'none') && (
        <Rect x={4.5} y={4.5} width={11} height={11} rx={1.6} transform="rotate(45 10 10)" fill="none" stroke={t.ink2} strokeWidth={1.6} strokeDasharray="2.6 2.1" />
      )}
    </G>
  );
}
