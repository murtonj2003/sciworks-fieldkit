// A small top-down drawing of the transect line (north up, to scale), with start/end and any animals as band
// marks. Plain SVG, so it works offline and in Expo Go. When HQ sent a satellite picture for this transect it is
// drawn underneath, inside the same <Svg>, with the same lon/lat → x/y maths as the line (lib/mapFrame), so it
// lines up exactly. No map library, no online tiles. The picture's credit line shows whenever it is visible.
import type { Transect } from '@sciworks/shared';
import { useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle, G, Image as SvgImage, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { basemapFile, basemapFor, type StoredBasemap } from '@/db/basemaps';
import { getMeta, setMeta } from '@/db/meta';
import { makeFrame, type LonLat } from '@/lib/mapFrame';
import { useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { day, radius, type } from '@/theme/theme';

import { MarkShape, type Band } from './Icon';

export interface MapPoint extends LonLat {
  band?: Band;
  label?: string;
  /** A "Did you mean?" fix not chosen yet: the strip's dashed mint ring with its number (1, 2…). */
  suggestion?: number;
}

/** Drawing width before the first layout; then the map draws at its real width, so the picture fills it. */
const W0 = 340;
const PAD = 26;
/** Over imagery the marks and words sit on a white outline in fixed day ink, whatever the theme. */
const HALO = '#FFFFFF';
const ON_IMG = '#1D1E1F';

/** A round scale-bar length for the map's width: 100 m, 200 m, 500 m, 1 km… */
function niceLength(m: number): number {
  const steps = [50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.reverse().find((s) => s <= m) ?? 50;
}

export type MapLayer = 'satellite' | 'plain';

/** The Satellite / Plain choice, kept on the phone so every map opens the way it was left. */
function useMapLayer(): [MapLayer, (l: MapLayer) => void] {
  const [layer, setLayer] = useState<MapLayer>(() => (getMeta('mapLayer') === 'plain' ? 'plain' : 'satellite'));
  return [
    layer,
    (l) => {
      setMeta('mapLayer', l);
      setLayer(l);
    },
  ];
}

const webHrefs = new Map<string, string>();
/** Phones load the saved JPEG by its file address; the dev-only browser preview has no files, so it gets a data URI. */
function hrefOf(b: StoredBasemap): string {
  const f = basemapFile(b);
  if (Platform.OS !== 'web') return f.uri;
  let h = webHrefs.get(b.path);
  if (!h) {
    h = `data:image/jpeg;base64,${(f as unknown as { base64Sync: () => string }).base64Sync()}`;
    webHrefs.set(b.path, h);
  }
  return h;
}

const useStyles = makeStyles((t) => ({
  clip: { borderRadius: 8, overflow: 'hidden' },
  foot: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 6, gap: 6 },
  seg: { flexDirection: 'row', alignSelf: 'flex-start', height: 44, padding: 3, borderRadius: radius.card, backgroundColor: t.segTrack },
  segBtn: { height: 38, minWidth: 88, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  segOn: {
    backgroundColor: t.segThumb,
    ...(t.name === 'day' ? { shadowColor: '#1D1E1F', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 } : {}),
  },
  segText: { ...type.small, color: t.ink2 },
  segTextOn: { color: t.ink, fontWeight: '600' },
  credit: { ...type.micro, lineHeight: 16, color: t.ink2 },
}));

export function TransectMap({
  transect,
  points = [],
  fit = [],
  links = [],
  height = 190,
  pad = PAD,
  showSwitch = true,
}: {
  transect: Transect;
  points?: MapPoint[];
  /** Extra positions the frame must include (e.g. a typed point that landed off the line). */
  fit?: LonLat[];
  /** Dashed connectors, e.g. from where a point was typed to the fix that was used. */
  links?: { from: LonLat; to: LonLat }[];
  height?: number;
  /** Clear space kept round the line and points (smaller = more zoomed in). */
  pad?: number;
  /** The Satellite / Plain switch. The choice is kept on the phone, so a map without it follows the others. */
  showSwitch?: boolean;
}) {
  const { t } = useTheme();
  const s = useStyles();
  const { basemaps } = useField();
  const [layer, setLayer] = useMapLayer();
  const H = height;
  const [W, setW] = useState(W0);
  const tf = Platform.OS === 'web' ? { fontFamily: 'system-ui, -apple-system, Helvetica, Arial, sans-serif' } : { fontFeatureSettings: "'tnum'" };
  const line = transect.geometry.coordinates as [number, number][];
  const basemap = basemapFor(basemaps, transect.properties.transectId, line);
  const href = useMemo(() => (basemap ? hrefOf(basemap) : null), [basemap]);
  const sat = !!basemap && !!href && layer === 'satellite';
  const frame = useMemo(() => makeFrame(line, W, H, pad, fit, sat ? basemap!.bounds : undefined), [line, W, H, pad, fit, sat, basemap]);
  if (line.length < 2) return null;

  const pts = line.map(([lo, la]) => frame.px(lo, la));
  const start = pts[0]!;
  const end = pts[pts.length - 1]!;
  const bar = niceLength(((W - 2 * pad) / frame.scale) * 0.35);
  const barPx = bar * frame.scale;
  const ink = sat ? ON_IMG : t.ink;
  const ink2 = sat ? ON_IMG : t.ink2;
  const img = basemap ? frame.rect(basemap.bounds) : null;
  // At night the white outlines and the picture are toned down so they don't glare on a dark screen.
  const haloOpacity = t.name === 'night' ? 0.7 : 0.9;

  /** Words on the map; over imagery they get a white outline first so they read on forest and road alike. */
  const label = (x: number, y: number, text: string, opts: { weight?: '600' | '700'; color?: string; anchor?: 'start' | 'middle' | 'end' } = {}) => (
    <G>
      {sat && (
        <SvgText x={x} y={y} fontSize={12} fontWeight={opts.weight ?? '600'} textAnchor={opts.anchor ?? 'start'} stroke={HALO} strokeWidth={3.5} strokeLinejoin="round" fill={HALO} {...tf}>
          {text}
        </SvgText>
      )}
      <SvgText x={x} y={y} fontSize={12} fontWeight={opts.weight ?? '600'} textAnchor={opts.anchor ?? 'start'} fill={opts.color ?? ink} {...tf}>
        {text}
      </SvgText>
    </G>
  );

  return (
    <View>
      <View style={s.clip} onLayout={(e) => setW(Math.max(200, Math.round(e.nativeEvent.layout.width)))}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={`Map of transect ${transect.properties.transectId}${sat ? ', on a satellite picture' : ''}`}>
          {sat && img && (
            <>
              <Rect x={0} y={0} width={W} height={H} fill={t.tile} />
              <SvgImage href={href!} x={img.x} y={img.y} width={img.width} height={img.height} preserveAspectRatio="none" opacity={t.name === 'night' ? 0.75 : 1} />
            </>
          )}
          {sat && <Polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={HALO} strokeOpacity={haloOpacity} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />}
          <Polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={sat ? ON_IMG : t.transect} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          {links.map((l, i) => {
            const a = frame.px(l.from.lon, l.from.lat);
            const b = frame.px(l.to.lon, l.to.lat);
            return (
              <G key={`l${i}`}>
                {sat && <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={HALO} strokeOpacity={haloOpacity} strokeWidth={5} strokeLinecap="round" />}
                <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ink2} strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" />
              </G>
            );
          })}
          {sat && <Circle cx={start.x} cy={start.y} r={9} fill={HALO} fillOpacity={haloOpacity} />}
          <Circle cx={start.x} cy={start.y} r={7} fill={ink} />
          {label(start.x + 11, start.y + 4, 'Start')}
          <Circle cx={end.x} cy={end.y} r={7} fill={sat ? HALO : t.card} stroke={ink} strokeWidth={2.5} />
          {label(end.x + 11, end.y + 4, 'End')}
          {points.map((p, i) => {
            const q = frame.px(p.lon, p.lat);
            const inside = q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H;
            if (!inside) return null; // a far-off point would squash the map; the strip and the list still show it
            return (
              <G key={i}>
                {sat && <Circle cx={q.x} cy={q.y} r={10.5} fill={HALO} fillOpacity={haloOpacity} />}
                {p.suggestion !== undefined ? (
                  <>
                    <Circle cx={q.x} cy={q.y} r={8} fill={sat ? HALO : t.card} stroke={sat ? day.onMark : t.onMark} strokeWidth={2} strokeDasharray="3 2.5" />
                    <SvgText x={q.x} y={q.y + 4} fontSize={11} fontWeight="700" fill={ink} textAnchor="middle" {...tf}>
                      {String(p.suggestion)}
                    </SvgText>
                  </>
                ) : (
                  <MarkShape band={p.band ?? 'none'} x={q.x - 8} y={q.y - 8} size={16} tokens={sat ? day : undefined} />
                )}
                {p.label ? label(q.x + 13, q.y + 4, p.label, { weight: '700' }) : null}
              </G>
            );
          })}
          <G>
            {sat && <Line x1={W - PAD} y1={18} x2={W - PAD} y2={40} stroke={HALO} strokeOpacity={haloOpacity} strokeWidth={5} strokeLinecap="round" />}
            <Line x1={W - PAD} y1={18} x2={W - PAD} y2={40} stroke={ink2} strokeWidth={2} />
            {label(W - PAD, 14, 'N', { weight: '700', color: ink2, anchor: 'middle' })}
          </G>
          {/* Scale bar bottom-right: the lines run SW → NE, so Start sits bottom-left and would collide. */}
          {sat && <Line x1={W - 12 - barPx} y1={H - 10} x2={W - 12} y2={H - 10} stroke={HALO} strokeOpacity={haloOpacity} strokeWidth={5} strokeLinecap="round" />}
          <Line x1={W - 12 - barPx} y1={H - 10} x2={W - 12} y2={H - 10} stroke={ink2} strokeWidth={2} />
          {label(W - 12 - barPx - 6, H - 6, bar >= 1000 ? `${bar / 1000} km` : `${bar} m`, { color: ink2, anchor: 'end' })}
        </Svg>
      </View>
      {basemap && href && (showSwitch || sat) && (
        <View style={s.foot}>
          {showSwitch && (
            <View style={s.seg} accessibilityRole="radiogroup" accessibilityLabel="Map background">
              {(['satellite', 'plain'] as const).map((l) => {
                const on = layer === l;
                return (
                  <Pressable key={l} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setLayer(l)} style={[s.segBtn, on && s.segOn]}>
                    <Text style={[s.segText, on && s.segTextOn]}>{l === 'satellite' ? 'Satellite' : 'Plain'}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {sat && <Text style={s.credit}>{basemap.attribution}</Text>}
        </View>
      )}
    </View>
  );
}
