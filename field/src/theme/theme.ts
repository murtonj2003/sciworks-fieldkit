// Fieldkit design tokens, day and night, ported from Sci-works hack/design/wireframes/fieldkit.css (the kit wins
// over DESIGN.md where they differ). Direction: Option E · Clean. Day pairs ≥ 7:1, night pairs ≥ 4.5:1 and dim.
import type { TextStyle } from 'react-native';

export interface Tokens {
  name: 'day' | 'night';
  ground: string;
  group: string;
  card: string;
  tile: string;
  ink: string;
  ink2: string;
  ink2OnSec: string;
  hair: string;
  track: string;
  transect: string;
  pri: string;
  priPress: string;
  onPri: string;
  sec: string;
  secPress: string;
  grey: string;
  greyPress: string;
  disFill: string;
  disInk: string;
  segTrack: string;
  segThumb: string;
  onFill: string;
  /** A softer mint for value chips that mark a real difference (compare, comp 4C). */
  onTint: string;
  onInk: string;
  onMark: string;
  onGlyph: string;
  nearFill: string;
  nearInk: string;
  nearMark: string;
  nearGlyph: string;
  offFill: string;
  offInk: string;
  offMark: string;
  offGlyph: string;
  offTint: string;
  offTintInk: string;
  recFill: string;
  recInk: string;
  editFill: string;
  editInk: string;
  focus: string;
  scrim: string;
  /** "Other apps" slice of the storage ring: a clear mid grey that never blurs into the mint (comp S1). */
  storageOther: string;
}

export const day: Tokens = {
  name: 'day',
  ground: '#FBFAFA',
  group: '#E6E8EB',
  card: '#FFFFFF',
  tile: '#E6E8EB',
  ink: '#1D1E1F',
  ink2: '#4D4947',
  ink2OnSec: '#4D4947',
  hair: '#E1E3E6',
  track: '#C5CBC3',
  transect: '#6F7378',
  pri: '#1D1E1F',
  priPress: '#484A4F',
  onPri: '#FFFFFF',
  sec: '#FFFFFF',
  secPress: '#E6E8EB',
  grey: '#E6E8EB',
  greyPress: '#D2D5DA',
  disFill: '#DCDFE3',
  disInk: '#6F7378',
  segTrack: '#E6E8EB',
  segThumb: '#FFFFFF',
  onFill: '#B3E8A1',
  onTint: '#DDF2D4',
  onInk: '#1F4A12',
  onMark: '#2F7A20',
  onGlyph: '#FFFFFF',
  nearFill: '#FFE2A8',
  nearInk: '#5C3D00',
  nearMark: '#C27C00',
  nearGlyph: '#1D1E1F',
  offFill: '#A21C15',
  offInk: '#FFFFFF',
  offMark: '#A21C15',
  offGlyph: '#FFFFFF',
  offTint: '#FBE1DE',
  offTintInk: '#8A1810',
  recFill: '#E6E8EB',
  recInk: '#4D4947',
  editFill: '#A6A0F0',
  editInk: '#1D1E1F',
  focus: '#1D1E1F',
  scrim: 'rgba(29,30,31,0.34)',
  storageOther: '#A9ACB0',
};

export const night: Tokens = {
  name: 'night',
  ground: '#0B0B0C',
  group: '#1C1C1E',
  card: '#2C2C2E',
  tile: '#3A3A3C',
  ink: '#D8D5D1',
  ink2: '#9E9A96',
  ink2OnSec: '#B5B1AC',
  hair: '#3A3A3C',
  track: '#48484A',
  transect: '#8E8A86',
  pri: '#9C9893',
  priPress: '#86827D',
  onPri: '#0B0B0C',
  sec: '#3A3A3C',
  secPress: '#4E4E50',
  grey: '#1C1C1E',
  greyPress: '#333335',
  disFill: '#242426',
  disInk: '#6E6B68',
  segTrack: '#1C1C1E',
  segThumb: '#3A3A3C',
  onFill: '#1F3A1A',
  onTint: '#1A2B17',
  onInk: '#B3E8A1',
  onMark: '#8FCB7C',
  onGlyph: '#0B0B0C',
  nearFill: '#3D2E0E',
  nearInk: '#F2C36B',
  nearMark: '#E0A63A',
  nearGlyph: '#0B0B0C',
  offFill: '#8A221B',
  offInk: '#F6DCD8',
  offMark: '#F08A80',
  offGlyph: '#0B0B0C',
  offTint: '#3E1714',
  offTintInk: '#F2A8A0',
  recFill: '#3A3A3C',
  recInk: '#C9C5C0',
  editFill: '#2E2A55',
  editInk: '#C9C4FA',
  focus: '#D8D5D1',
  scrim: 'rgba(0,0,0,0.6)',
  storageOther: '#636366',
};

/** Type scale (kit `--fs-*`). One system family; every number tabular; species italic. */
const tab: TextStyle = { fontVariant: ['tabular-nums'] };
export const type = {
  display: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6, lineHeight: 35 } as TextStyle,
  numeral: { fontSize: 26, fontWeight: '600', letterSpacing: -0.26, ...tab } as TextStyle,
  input: { fontSize: 24, fontWeight: '600', letterSpacing: -0.36, ...tab } as TextStyle,
  head: { fontSize: 20, fontWeight: '600', letterSpacing: -0.2, lineHeight: 24 } as TextStyle,
  headBold: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2, lineHeight: 24 } as TextStyle,
  title: { fontSize: 17, fontWeight: '600', lineHeight: 22 } as TextStyle,
  body: { fontSize: 17, fontWeight: '400', lineHeight: 22, ...tab } as TextStyle,
  sub: { fontSize: 15, fontWeight: '400', lineHeight: 20, ...tab } as TextStyle,
  label: { fontSize: 15, fontWeight: '600', lineHeight: 20 } as TextStyle,
  small: { fontSize: 13, fontWeight: '500', lineHeight: 17 } as TextStyle,
  micro: { fontSize: 12, fontWeight: '500', ...tab } as TextStyle,
  species: { fontStyle: 'italic' } as TextStyle,
};

export const radius = { tag: 8, tile: 8, card: 12, chip: 14, group: 16, dialog: 20, pill: 999 };
export const space = { xs: 4, inset: 6, sm: 8, gap: 10, md: 12, cardX: 14, gutter: 16, lg: 20 };
