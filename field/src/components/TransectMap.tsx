// A small top-down drawing of the transect line (north up, to scale), with start/end and any animals as dots.
// Plain SVG so it works offline and in Expo Go. A satellite background needs a map library and offline tiles
// (P3); this keeps the same shape and position so it can sit on top of one later.
import type { CoordBand, Transect } from '@sciworks/shared';
import { Platform } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

import { MarkShape } from './Icon';

export interface MapPoint {
  lat: number;
  lon: number;
  band?: CoordBand;
  label?: string;
}

const W = 340;
const H = 190;
const PAD = 26;
const M_PER_DEG_LAT = 111_320;


/** A round scale-bar length for the map's width: 100 m, 200 m, 500 m, 1 km… */
function niceLength(m: number): number {
  const steps = [50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.reverse().find((s) => s <= m) ?? 50;
}

export function TransectMap({ transect, points = [] }: { transect: Transect; points?: MapPoint[] }) {
  const { t } = useTheme();
  const tf = Platform.OS === 'web' ? { fontFamily: 'system-ui, -apple-system, Helvetica, Arial, sans-serif' } : { fontFeatureSettings: "'tnum'" };
  const line = transect.geometry.coordinates as [number, number][];
  if (line.length < 2) return null;
  const lats = line.map(([, la]) => la);
  const lons = line.map(([lo]) => lo);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  // Metres from the south-west corner, so the drawing is to scale.
  const toM = (lon: number, lat: number) => ({ x: (lon - Math.min(...lons)) * mPerDegLon, y: (lat - Math.min(...lats)) * M_PER_DEG_LAT });
  const spanX = Math.max((Math.max(...lons) - Math.min(...lons)) * mPerDegLon, 1);
  const spanY = Math.max((Math.max(...lats) - Math.min(...lats)) * M_PER_DEG_LAT, 1);
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  const px = (lon: number, lat: number) => {
    const m = toM(lon, lat);
    return { x: offX + m.x * scale, y: H - (offY + m.y * scale) };
  };
  const pts = line.map(([lo, la]) => px(lo, la));
  const start = pts[0]!;
  const end = pts[pts.length - 1]!;
  const bar = niceLength(((W - 2 * PAD) / scale) * 0.35);
  const barPx = bar * scale;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={`Map of transect ${transect.properties.transectId}`}>
      <Polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={t.transect} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={start.x} cy={start.y} r={7} fill={t.ink} />
      <SvgText x={start.x + 11} y={start.y + 4} fontSize={12} fontWeight="600" fill={t.ink} {...tf}>
        Start
      </SvgText>
      <Circle cx={end.x} cy={end.y} r={7} fill={t.card} stroke={t.ink} strokeWidth={2.5} />
      <SvgText x={end.x + 11} y={end.y + 4} fontSize={12} fontWeight="600" fill={t.ink} {...tf}>
        End
      </SvgText>
      {points.map((p, i) => {
        const q = px(p.lon, p.lat);
        const inside = q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H;
        if (!inside) return null; // a far-off point would squash the map; the strip and the list still show it
        return (
          <G key={i}>
            <MarkShape band={p.band ?? 'none'} x={q.x - 8} y={q.y - 8} size={16} />
            {p.label ? (
              <SvgText x={q.x + 11} y={q.y + 4} fontSize={12} fontWeight="700" fill={t.ink} {...tf}>
                {p.label}
              </SvgText>
            ) : null}
          </G>
        );
      })}
      <G>
        <Line x1={W - PAD} y1={18} x2={W - PAD} y2={40} stroke={t.ink2} strokeWidth={2} />
        <SvgText x={W - PAD} y={14} fontSize={12} fontWeight="700" fill={t.ink2} textAnchor="middle" {...tf}>
          N
        </SvgText>
      </G>
      <Line x1={PAD} y1={H - 10} x2={PAD + barPx} y2={H - 10} stroke={t.ink2} strokeWidth={2} />
      <SvgText x={PAD + barPx + 6} y={H - 6} fontSize={12} fill={t.ink2} {...tf}>
        {bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}
      </SvgText>
    </Svg>
  );
}
