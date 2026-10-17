// P6 · Typed-coordinate entry with a live check against the transect line (MOBILE-BRIEF F3; design P6a–P6d).
// Never auto-corrects: it suggests, explains why, and the surveyor chooses. The typed string is kept exactly, and
// the value before any accepted fix is stored as `original`. The rules live in model/location.ts (tested); this
// file only draws them in the kit's anatomy: segmented format → typed field → band block → strip → "Did you mean?".
import {
  FORMAT_LABELS,
  checkCoordinate,
  parseTyped,
  type CoordCheck,
  type CoordFormat,
  type CoordSuggestion,
  type Location,
  type Project,
  type Transect,
} from '@sciworks/shared';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { getMeta, setMeta } from '@/db/meta';
import type { LonLat } from '@/lib/mapFrame';
import { acceptSuggestion, isMoved, keepTyped, onEntryChange, whereNow, type EntryContext, type LocationChange } from '@/model/location';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

import { NumberInput, TextBox, useFieldStyles } from './fields';
import { BAND_WORD, BandMarker, Icon, type Band } from './Icon';
import { TransectMap, type MapPoint } from './TransectMap';
import { TransectStrip, type StripPoint } from './TransectStrip';
import { Button, Group, Hint, Pair, T } from './ui';

export type { LocationChange } from '@/model/location';

const FORMATS: { code: CoordFormat; label: string; prefix?: string }[] = [
  { code: 'utm16n', label: 'UTM 16N', prefix: '16P' },
  { code: 'utm17n', label: 'UTM 17N', prefix: '17P' },
  { code: 'crtm05', label: 'CRTM05' },
  { code: 'dd', label: 'DD' },
  { code: 'dm', label: 'DM' },
];

const EXAMPLES: Record<CoordFormat, string> = {
  utm16n: '825749 1153170',
  utm17n: '171234 1150456',
  crtm05: '490123 1151234',
  dd: '10.4123, -84.0123',
  dm: 'N10 24.738 W84 00.738',
  dms: 'N10 24 44.3 W84 00 44.3',
};

/** Browser preview only: hide the browser's own focus outline (the kit draws its own ink ring). */
const WEB_NO_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {};

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const distance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${thousands(m)} m`);

const FLAG_WORDS: Partial<Record<string, string>> = {
  PRESUMED_NEGATED_LONGITUDE: 'The longitude may be missing its minus sign (west is negative).',
  PRESUMED_SWAPPED_COORDINATE: 'Latitude and longitude may be the wrong way round.',
  TYPED_DISTANCE_DISAGREES: 'The typed distance along the transect does not match where this point is.',
  ORDER_REVERSED: 'This point is behind the previous animal on a one-way walk.',
};

/** Band words for other screens too (survey list, inbox): shape + word, never colour alone. */
export function bandWords(check: CoordCheck, transectId: string): { word: string; detail: string } {
  switch (check.band) {
    case 'green':
      return { word: BAND_WORD.green, detail: `${check.offsetM.toFixed(1)} m from ${transectId} · ${thousands(check.chainageM)} m along` };
    case 'amber':
    case 'red':
      return { word: BAND_WORD[check.band], detail: `${thousands(check.offsetM)} m off ${transectId} (allowed ${Math.round(check.toleranceM)} m)` };
    default:
      return { word: BAND_WORD['outside-bbox'], detail: 'Not inside the project area at all' };
  }
}

/** The changed characters between what was typed and a fix: the one number token that differs, split into
 * same-before / changed / same-after, so the card can mark them (red tint on the old, mint on the new). */
function diffTokens(raw: string, fixed: string | undefined): { before: string; old: string; neu: string; after: string } | null {
  if (!fixed) return null;
  const a = raw.trim().split(/[\s,]+/);
  const b = fixed.trim().split(/[\s,]+/);
  // The fix may carry the zone label ("16P") that the box shows as a prefix; compare the numbers only.
  const nums = (xs: string[]) => xs.filter((x) => /\d{3,}/.test(x));
  const na = nums(a);
  const nb = nums(b);
  if (na.length !== nb.length) return null;
  const i = na.findIndex((tok, k) => tok !== nb[k]);
  if (i < 0) return null;
  const x = na[i]!;
  const y = nb[i]!;
  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let q = 0;
  while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
  return { before: x.slice(0, p), old: x.slice(p, x.length - q), neu: y.slice(p, y.length - q), after: x.slice(x.length - q) };
}

/** "Swap the 4th and 5th digits of the northing (1151370 → 1153170)." → "Swap the 4th and 5th digits of the northing". */
const plainExplain = (explain: string) => explain.replace(/\s*\([^)]*→[^)]*\)\s*\.?$/, '').replace(/\.$/, '');

const useStyles = makeStyles((t) => ({
  seg: { flexDirection: 'row', height: 56, padding: 4, borderRadius: radius.group, backgroundColor: t.segTrack },
  segBtn: { flexGrow: 1, height: 48, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segOn: {
    backgroundColor: t.segThumb,
    ...(t.name === 'day' ? { shadowColor: '#1D1E1F', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 } : {}),
  },
  segText: { ...type.sub, fontWeight: '500', color: t.ink2 },
  segTextOn: { color: t.ink, fontWeight: '600' },
  gt: { ...type.small, color: t.ink2, marginHorizontal: 4, marginBottom: 6 },
  coordBox: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 12,
    paddingRight: 4,
    backgroundColor: t.card,
    borderRadius: radius.card,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  coordFocus: { borderColor: t.ink },
  coordPrefix: { ...type.input, color: t.ink2 },
  coordInput: { ...type.input, color: t.ink, minWidth: 0, minHeight: 56, paddingVertical: 0, paddingHorizontal: 0, ...WEB_NO_OUTLINE },
  coordInputText: { ...type.input, color: t.ink },
  coordHidden: { color: 'transparent' },
  fixedOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  help: { ...type.small, fontWeight: '400', color: t.ink2, marginTop: 6, marginHorizontal: 4 },
  block: { borderRadius: radius.card, paddingTop: 12, paddingBottom: 13, paddingHorizontal: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  blockTitle: { ...type.headBold },
  blockDetail: { ...type.sub, marginTop: 2 },
  strip: { backgroundColor: t.card, borderRadius: radius.card, paddingTop: 8, paddingHorizontal: 10, paddingBottom: 4 },
  mapCard: { backgroundColor: t.card, borderRadius: radius.card, paddingHorizontal: 6, paddingVertical: 4, marginTop: 8 },
  dym: { backgroundColor: t.group, borderRadius: radius.group, paddingTop: 11, paddingHorizontal: 8, paddingBottom: 2, marginTop: 10 },
  dymHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 6 },
  src: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingLeft: 7, paddingRight: 9, borderRadius: radius.tag, backgroundColor: t.card },
  srcText: { ...type.small, fontWeight: '600', color: t.ink2 },
  what: { ...type.sub, color: t.ink2, paddingTop: 4, paddingHorizontal: 6 },
  body: { backgroundColor: t.card, borderRadius: radius.card, marginTop: 10, overflow: 'hidden' },
  change: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 4, paddingTop: 8, paddingBottom: 7, paddingHorizontal: 14 },
  old: { fontSize: 20, color: t.ink2, fontVariant: ['tabular-nums'] },
  neu: { ...type.numeral, color: t.ink },
  cut: { backgroundColor: t.offTint, color: t.offTintInk },
  add: { backgroundColor: t.onFill, color: t.onInk },
  effect: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: t.onFill },
  effectText: { ...type.sub, fontWeight: '500', color: t.onInk, flex: 1 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actBtn: { flex: 1, paddingHorizontal: 12 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  opt: { flexDirection: 'row', gap: 10, padding: 12 },
  optSep: { height: 1, backgroundColor: t.hair, marginLeft: 50 },
  disc: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.pri },
  discText: { fontSize: 15, fontWeight: '700', color: t.onPri },
  optWhat: { ...type.sub, color: t.ink, paddingTop: 4 },
  optEff: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  optEffText: { ...type.small, fontWeight: '400', color: t.ink2, flex: 1 },
  done: { flexDirection: 'row', gap: 12, paddingTop: 6, paddingHorizontal: 8, paddingBottom: 6, alignItems: 'flex-start' },
  doneTitle: { ...type.title, color: t.ink },
  doneText: { ...type.sub, color: t.ink2 },
}));

export function LocationEntry({
  location,
  transect,
  project,
  personId,
  now,
  previousChainageM,
  typedDistanceM,
  onChange,
  distanceField,
}: {
  location: Location | undefined;
  transect: Transect;
  project: Project;
  personId: string;
  now: () => string;
  previousChainageM?: number;
  typedDistanceM?: number;
  onChange: (c: LocationChange) => void;
  /** The screen's "Distance along transect" field, drawn in this block's fields group (design P6). */
  distanceField?: ReactNode;
}) {
  const s = useStyles();
  const fs = useFieldStyles();
  const { t } = useTheme();
  const [format, setFormat] = useState<CoordFormat>((location?.typed?.format ?? (getMeta('coordFormat') as CoordFormat | null)) || 'utm16n');
  const [raw, setRaw] = useState(location?.typed?.raw ?? '');
  const [accuracy, setAccuracy] = useState<number | undefined>(location?.accuracyM);
  const [retaking, setRetaking] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [reason, setReason] = useState('');
  const [focus, setFocus] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const parsed = useMemo(() => (raw.trim() ? parseTyped(raw, format) : null), [raw, format]);
  const typedPoint = parsed && !('error' in parsed) ? parsed : null;
  const check = useMemo(
    () =>
      typedPoint
        ? checkCoordinate({ ...typedPoint, accuracyM: accuracy, typed: { raw, format }, previousChainageM, typedDistanceM }, transect, project)
        : null,
    [typedPoint, accuracy, raw, format, previousChainageM, typedDistanceM, transect, project],
  );

  const ctx: EntryContext = { transect, project, personId, now, previousChainageM, typedDistanceM };
  const sameEntry = location?.typed?.raw === raw && location.typed.format === format;
  const decision = sameEntry ? location!.check.decision : undefined;
  const moved = location && ((sameEntry && isMoved(location)) || (!location.typed && !raw.trim())) ? location : null;
  const movedNow = moved ? whereNow(moved, ctx) : null;
  const byHq = !!decision?.reason?.startsWith('HQ correction');
  const usedSuggestion =
    moved && decision?.kind === 'accepted-suggestion' && !byHq ? check?.suggestions.find((sg) => sg.kind === decision.suggestionKind) : undefined;

  // After "Use this" the box shows the fixed value with the moved digits in mint (P6b). The input keeps the
  // typed text underneath (typed.raw is what was typed); tapping it brings the typed text back for editing.
  const fixedView = (() => {
    if (!usedSuggestion || focus) return null;
    const d = diffTokens(raw, usedSuggestion.raw);
    if (!d) return null;
    const oldTok = d.before + d.old + d.after;
    const at = raw.indexOf(oldTok);
    if (at < 0) return null;
    return { lead: raw.slice(0, at) + d.before, neu: d.neu, trail: d.after + raw.slice(at + oldTok.length), plain: raw.slice(0, at) + d.before + d.neu + d.after + raw.slice(at + oldTok.length) };
  })();

  const emit = (nextRaw: string, nextFormat: CoordFormat, nextAccuracy: number | undefined) =>
    onChange(onEntryChange(location, nextRaw, nextFormat, nextAccuracy, ctx, retaking));
  /** Undo a choice: back to the plain typed reading (the choice stays in the record's history). */
  const undo = () => onChange(onEntryChange(undefined, raw, format, accuracy, ctx));
  const keep = (kind: 'kept-original' | 'override') => {
    onChange(keepTyped(raw, format, accuracy, kind, reason.trim() || undefined, ctx));
    setOverriding(false);
  };
  const use = (sg: CoordSuggestion) => onChange(acceptSuggestion(raw, format, accuracy, sg, ctx));
  const retake = () => {
    setRetaking(true);
    setRaw('');
    onChange(onEntryChange(location, '', format, accuracy, ctx));
  };

  // Strip points: the typed point, then the fixes (or the point now used).
  const points: StripPoint[] = [];
  if (check) points.push({ chainageM: check.chainageM, offsetM: check.offsetM, kind: 'typed', band: check.band });
  if (moved && movedNow) points.push({ chainageM: movedNow.chainageM, offsetM: movedNow.offsetM, kind: 'accepted' });
  else check?.suggestions.forEach((sg) => points.push({ chainageM: sg.chainageM, offsetM: sg.offsetM, kind: 'suggestion' }));

  // The small north-up map (on the satellite picture when HQ sent one): the line, where the point was typed and
  // the fix. A typo that lands more than 3 km away is left off, or the line would shrink to a dot; the strip
  // above still shows it.
  const typedOnMap = !!check && !!typedPoint && check.offsetM <= 3000;
  const mapPoints: MapPoint[] = [];
  const mapLinks: { from: LonLat; to: LonLat }[] = [];
  if (check && typedPoint && typedOnMap) {
    mapPoints.push({ lat: typedPoint.lat, lon: typedPoint.lon, band: moved ? 'typed' : check.band, label: 'as typed' });
  }
  if (moved && movedNow) {
    mapPoints.push({ lat: moved.lat, lon: moved.lon, band: movedNow.band, label: check?.suggestions.length === 1 || !check ? 'used' : undefined });
    if (typedOnMap && typedPoint) mapLinks.push({ from: typedPoint, to: moved });
  } else if (check) {
    check.suggestions.forEach((sg, i) => {
      mapPoints.push({ lat: sg.lat, lon: sg.lon, suggestion: i + 1, label: check.suggestions.length === 1 ? 'suggestion' : undefined });
      if (typedOnMap && typedPoint) mapLinks.push({ from: typedPoint, to: sg });
    });
  }

  const needsChoice = !!check && check.band !== 'green' && !decision;
  const prefix = FORMATS.find((f) => f.code === format)?.prefix;

  // The band block shows where the point is now: the used fix if any, else the typed reading.
  const blockBand: Band | null = movedNow ? movedNow.band : check ? check.band : null;
  const blockWords = movedNow
    ? { word: BAND_WORD[movedNow.band], detail: `${movedNow.offsetM.toFixed(1)} m from ${transect.properties.transectId}` }
    : check
      ? bandWords(check, transect.properties.transectId)
      : null;
  const blockColors: Record<string, [string, string]> = {
    green: [t.onFill, t.onInk],
    amber: [t.nearFill, t.nearInk],
    red: [t.offFill, t.offInk],
    'outside-bbox': [t.offTint, t.offTintInk],
  };

  const change = (sg: CoordSuggestion, compact?: boolean) => {
    const d = diffTokens(raw, sg.raw);
    if (!d) return null;
    return (
      <View style={[s.change, compact && { paddingHorizontal: 0, paddingTop: 2, paddingBottom: 0 }]} accessibilityLabel={`${d.before}${d.old}${d.after} to ${d.before}${d.neu}${d.after}`}>
        <Text style={[s.old, compact && { fontSize: 17 }]}>
          {d.before}
          <Text style={s.cut}>{d.old}</Text>
          {d.after}
        </Text>
        <Icon name="arrow" size={18} color={t.ink2} />
        <Text style={[s.neu, compact && { fontSize: 22 }]}>
          {d.before}
          <Text style={s.add}>{d.neu}</Text>
          {d.after}
        </Text>
      </View>
    );
  };

  const effect = (sg: CoordSuggestion) => `${sg.offsetM.toFixed(1)} m from the line · ${thousands(sg.chainageM)} m along`;

  return (
    <View>
      <Text style={s.gt}>Format (as set on the GPS)</Text>
      <View style={s.seg} accessibilityRole="radiogroup" accessibilityLabel="Format (as set on the GPS)">
        {FORMATS.map((f) => {
          const on = f.code === format;
          return (
            <Pressable
              key={f.code}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[s.segBtn, on && s.segOn]}
              onPress={() => {
                setFormat(f.code);
                setMeta('coordFormat', f.code);
                emit(raw, f.code, accuracy);
              }}
            >
              <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Group style={{ marginTop: 10 }}>
        <View style={[s.coordBox, focus && s.coordFocus]}>
          {prefix && <Text style={s.coordPrefix}>{prefix}</Text>}
          <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
          {fixedView && (
              <Pressable style={s.fixedOverlay} onPress={() => inputRef.current?.focus()} accessibilityRole="text" accessibilityLabel={`Used: ${fixedView.plain}`}>
              <Text style={[s.coordInputText]} numberOfLines={1}>
                {fixedView.lead}
                <Text style={s.add}>{fixedView.neu}</Text>
                {fixedView.trail}
              </Text>
            </Pressable>
          )}
          <TextInput
            ref={inputRef}
            style={[s.coordInput, fixedView && s.coordHidden]}
            value={raw}
            accessibilityLabel="Coordinate"
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType={prefix || format === 'crtm05' ? 'numbers-and-punctuation' : 'default'}
            placeholder={EXAMPLES[format]}
            placeholderTextColor={t.ink2}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onChangeText={(x) => {
              setRaw(x);
              emit(x, format, accuracy);
            }}
          />
          </View>
          <View style={{ width: 36, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="keypad" size={20} color={t.ink2} />
          </View>
        </View>
        <Text style={s.help}>{FORMAT_LABELS[format]} · type it exactly as the GPS shows it</Text>
        {parsed && 'error' in parsed && <Text style={s.help}>{parsed.error}</Text>}

        {blockBand && blockWords && (
          <View style={[s.block, { backgroundColor: blockColors[blockBand]![0] }]} accessibilityLiveRegion="polite">
            <BandMarker band={blockBand} size={24} onSolid={blockBand === 'red'} />
            <View style={{ flex: 1 }}>
              <Text style={[s.blockTitle, { color: blockColors[blockBand]![1] }]}>
                {blockWords.word}
                {moved && moved.typed && byHq ? ' · corrected by HQ' : ''}
              </Text>
              <Text style={[s.blockDetail, { color: blockColors[blockBand]![1] }]}>{blockWords.detail}</Text>
              {moved && !moved.typed && (
                <Text style={[s.blockDetail, { color: blockColors[blockBand]![1] }]}>From the {moved.source === 'garmin-gpx' ? 'Garmin file' : "phone's GPS"}.</Text>
              )}
            </View>
          </View>
        )}

        {check && !moved && check.flags.map((f) => (FLAG_WORDS[f] ? <Hint key={f} line>{FLAG_WORDS[f]}</Hint> : null))}

        {check && (
          <View style={s.strip}>
            <TransectStrip
              lengthM={transect.properties.lengthM}
              toleranceM={check.toleranceM}
              amberMultiplier={project.coordCheck.amberMultiplier}
              points={points}
              transectId={transect.properties.transectId}
            />
          </View>
        )}
        {check && mapPoints.length > 0 && (
          <View style={s.mapCard}>
            <TransectMap transect={transect} height={170} points={mapPoints} fit={mapPoints} links={mapLinks} />
          </View>
        )}
      </Group>

      {/* After a choice the card folds to one line on the grey group, with Undo (design P6b). */}
      {decision && (
        <Group style={{ marginTop: 10 }}>
          <View style={s.done}>
            <BandMarker band={movedNow ? movedNow.band : (check?.band ?? 'none')} size={24} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[s.doneTitle, { flex: 1 }]}>
                  {decision.kind === 'accepted-suggestion'
                    ? byHq
                      ? 'Correction from HQ used'
                      : 'Suggestion used'
                    : decision.kind === 're-taken'
                      ? 'Re-taken from the GPS.'
                      : 'Kept as typed.'}
                </Text>
                {!byHq && <Button kind="white" size={48} icon="undo" label="Undo" onPress={undo} />}
              </View>
              {moved && movedNow && (
                <Text style={s.doneText}>
                  Now {movedNow.offsetM.toFixed(1)} m from {transect.properties.transectId}, {thousands(movedNow.chainageM)} m along.
                  {moved.typed ? ' What you typed is kept on the record.' : ''}
                </Text>
              )}
              {decision.kind === 'override' && decision.reason ? <Text style={s.doneText}>Reason: {decision.reason}</Text> : null}
            </View>
          </View>
        </Group>
      )}

      {needsChoice && check && (
        <View style={s.dym} accessibilityLabel="Did you mean?">
          <View style={s.dymHead}>
            <T v="headBold">{check.suggestions.length > 0 ? 'Did you mean?' : 'No fix found'}</T>
            <View style={s.src}>
              <Icon name="crosshair" size={15} color={t.ink2} />
              <Text style={s.srcText}>Coordinate check</Text>
            </View>
          </View>

          {check.suggestions.length === 1 && (
            <>
              <Text style={s.what}>{plainExplain(check.suggestions[0]!.explain)}</Text>
              <View style={s.body}>
                {change(check.suggestions[0]!)}
                <View style={s.effect}>
                  <BandMarker band="green" size={14} />
                  <Text style={s.effectText}>{effect(check.suggestions[0]!)}</Text>
                </View>
              </View>
            </>
          )}

          {check.suggestions.length > 1 && (
            <View style={s.body}>
              {check.suggestions.map((sg, i) => (
                <View key={`${sg.kind}-${i}`}>
                  {i > 0 && <View style={s.optSep} />}
                  <View style={s.opt}>
                    <View style={s.disc}>
                      <Text style={s.discText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={s.optWhat}>{plainExplain(sg.explain)}</Text>
                      {change(sg, true)}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                        <View style={s.optEff}>
                          <BandMarker band="green" size={14} />
                          <Text style={s.optEffText}>{effect(sg)}</Text>
                        </View>
                        <Button label="Use this" size={48} kind={i === 0 ? 'primary' : 'grey'} onPress={() => use(sg)} />
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {check.suggestions.length === 0 && (
            <Text style={s.what}>No single typing mistake puts this point on the line. Check the GPS reading.</Text>
          )}

          {!overriding && (
            <>
              <View style={s.actions}>
                {check.suggestions.length === 1 && <Button label="Use this" style={s.actBtn} onPress={() => use(check.suggestions[0]!)} />}
                {check.suggestions.length === 0 && <Button label="Re-take" icon="retake" style={s.actBtn} onPress={retake} />}
                <Button label="Keep as typed" kind="white" style={s.actBtn} onPress={() => keep('kept-original')} />
              </View>
              <View style={s.links}>
                {check.suggestions.length > 0 && <Button kind="link" label="Re-take" icon="retake" onPress={retake} />}
                <Button kind="link" label="Override with a reason" onPress={() => setOverriding(true)} />
              </View>
            </>
          )}

          {overriding && (
            <View style={{ gap: 8, marginTop: 10, marginBottom: 8 }}>
              <TextBox
                value={reason || undefined}
                onChange={(v) => setReason(v ?? '')}
                multiline
                placeholder="Why is this point right? e.g. the animal was 40 m off the trail at a stream"
              />
              {!reason.trim() && <Text style={s.help}>Type a reason to save.</Text>}
              <Pair>
                <Button label="Save override" style={{ flex: 1 }} disabled={!reason.trim()} onPress={() => keep('override')} />
                <Button label="Cancel" kind="white" style={{ flex: 1 }} onPress={() => setOverriding(false)} />
              </Pair>
            </View>
          )}
        </View>
      )}

      <Group style={{ marginTop: 10 }}>
        {distanceField}
        <View style={fs.field}>
          <Text style={[fs.label, { marginHorizontal: 4 }]}>
            GPS accuracy<Text style={{ fontWeight: '400', color: t.ink2 }}>, if the GPS shows it</Text>
          </Text>
          <NumberInput
            value={accuracy}
            unit="m"
            accessibilityLabel="GPS accuracy"
            onChange={(a) => {
              setAccuracy(a);
              emit(raw, format, a);
            }}
          />
        </View>
      </Group>
    </View>
  );
}
