// Typed-coordinate entry with a live check against the transect line (MOBILE-BRIEF F3).
// Never auto-corrects: it suggests, explains why, and the surveyor chooses. The typed string is kept exactly,
// and the value before any accepted fix is stored as `original`.
import {
  FORMAT_LABELS,
  checkCoordinate,
  parseTyped,
  type CoordCheck,
  type CoordFormat,
  type Location,
  type Project,
  type Transect,
} from '@sciworks/shared';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { getMeta, setMeta } from '@/db/meta';
import { acceptSuggestion, isMoved, keepTyped, onEntryChange, whereNow, type EntryContext, type LocationChange } from '@/model/location';

import { Chips, Hint, NumberInput, s as fs } from './fields';
import { TransectStrip, type StripPoint } from './TransectStrip';
import { Button, colors } from './ui';

const FORMATS: { code: CoordFormat; label: string }[] = [
  { code: 'utm16n', label: 'UTM 16N' },
  { code: 'utm17n', label: 'UTM 17N' },
  { code: 'crtm05', label: 'CRTM05' },
  { code: 'dd', label: 'DD' },
  { code: 'dm', label: 'DM' },
];

const EXAMPLES: Record<CoordFormat, string> = {
  utm16n: '16P 825749 1153170',
  utm17n: '17P 171234 1150456',
  crtm05: '490123 1151234',
  dd: '10.4123, -84.0123',
  dm: "N10 24.738 W84 00.738",
  dms: 'N10 24 44.3 W84 00 44.3',
};

const distance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

const FLAG_WORDS: Partial<Record<string, string>> = {
  PRESUMED_NEGATED_LONGITUDE: 'The longitude may be missing its minus sign (west is negative).',
  PRESUMED_SWAPPED_COORDINATE: 'Latitude and longitude may be the wrong way round.',
  TYPED_DISTANCE_DISAGREES: 'The typed distance along the transect does not match where this point is.',
  ORDER_REVERSED: 'This point is behind the previous animal on a one-way walk.',
};

export function bandWords(check: CoordCheck, transectId: string): { icon: string; word: string; detail: string; color: string } {
  switch (check.band) {
    case 'green':
      return { icon: '✓', word: 'On the line', detail: `${distance(check.offsetM)} from ${transectId}`, color: colors.green };
    case 'amber':
      return {
        icon: '⚠',
        word: 'Near the line',
        detail: `${distance(check.offsetM)} off ${transectId} (allowed ${Math.round(check.toleranceM)} m)`,
        color: colors.amber,
      };
    case 'red':
      return { icon: '✗', word: 'Off the line', detail: `${distance(check.offsetM)} off ${transectId}`, color: colors.red };
    default:
      return { icon: '✗', word: 'Outside the project area', detail: 'Not inside the project area at all', color: colors.red };
  }
}

export type { LocationChange } from '@/model/location';

export function LocationEntry({
  location,
  transect,
  project,
  personId,
  now,
  previousChainageM,
  typedDistanceM,
  onChange,
}: {
  location: Location | undefined;
  transect: Transect;
  project: Project;
  personId: string;
  now: () => string;
  previousChainageM?: number;
  typedDistanceM?: number;
  onChange: (c: LocationChange) => void;
}) {
  const [format, setFormat] = useState<CoordFormat>(
    (location?.typed?.format ?? (getMeta('coordFormat') as CoordFormat | null)) || 'utm16n',
  );
  const [raw, setRaw] = useState(location?.typed?.raw ?? '');
  const [accuracy, setAccuracy] = useState<number | undefined>(location?.accuracyM);
  const [retaking, setRetaking] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [reason, setReason] = useState('');

  const parsed = useMemo(() => (raw.trim() ? parseTyped(raw, format) : null), [raw, format]);
  const typedPoint = parsed && !('error' in parsed) ? parsed : null;
  const check = useMemo(
    () =>
      typedPoint
        ? checkCoordinate(
            { ...typedPoint, accuracyM: accuracy, typed: { raw, format }, previousChainageM, typedDistanceM },
            transect,
            project,
          )
        : null,
    [typedPoint, accuracy, raw, format, previousChainageM, typedDistanceM, transect, project],
  );

  const ctx: EntryContext = { transect, project, personId, now, previousChainageM, typedDistanceM };
  const sameEntry = location?.typed?.raw === raw && location.typed.format === format;
  const decision = sameEntry ? location!.check.decision : undefined;
  // The stored point is somewhere other than the typed text says (a used suggestion or an HQ correction), or it
  // came from a GPS file with nothing typed: show where it is now.
  const moved = location && ((sameEntry && isMoved(location)) || (!location.typed && !raw.trim())) ? location : null;
  const movedNow = moved ? whereNow(moved, ctx) : null;
  const byHq = !!decision?.reason?.startsWith('HQ correction');

  function emit(nextRaw: string, nextFormat: CoordFormat, nextAccuracy: number | undefined) {
    onChange(onEntryChange(location, nextRaw, nextFormat, nextAccuracy, ctx, retaking));
  }

  function keep(kind: 'kept-original' | 'override') {
    onChange(keepTyped(raw, format, accuracy, kind, reason.trim() || undefined, ctx));
    setOverriding(false);
  }

  const points: StripPoint[] = [];
  if (check) points.push({ chainageM: check.chainageM, offsetM: check.offsetM, kind: 'typed', label: 'typed' });
  if (moved && movedNow) {
    points.push({ chainageM: movedNow.chainageM, offsetM: movedNow.offsetM, kind: 'accepted', label: `${movedNow.offsetM.toFixed(0)} m` });
  } else if (check) {
    check.suggestions.forEach((sg, i) => points.push({ chainageM: sg.chainageM, offsetM: sg.offsetM, kind: 'suggestion', label: `${i + 1}` }));
  }

  const words = check ? bandWords(check, transect.properties.transectId) : null;
  const movedWords = moved && movedNow ? bandWords({ ...moved.check, ...movedNow }, transect.properties.transectId) : null;
  const needsChoice = check && check.band !== 'green' && !decision;

  return (
    <View style={styles.wrap}>
      <Text style={fs.small}>Format (as set on the GPS)</Text>
      <Chips
        options={FORMATS}
        value={format}
        onChange={(v) => {
          if (!v) return;
          const f = v as CoordFormat;
          setFormat(f);
          setMeta('coordFormat', f);
          emit(raw, f, accuracy);
        }}
      />
      <TextInput
        style={[fs.input, styles.mono]}
        value={raw}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={EXAMPLES[format]}
        placeholderTextColor={colors.dim}
        onChangeText={(t) => {
          setRaw(t);
          emit(t, format, accuracy);
        }}
      />
      <Text style={fs.small}>{FORMAT_LABELS[format]} · type it exactly as the GPS shows it</Text>
      {parsed && 'error' in parsed && <Hint text={parsed.error} tone="info" />}

      {/* Once the point has moved (a suggestion used, or an HQ correction), the box shows where it is now.
          What was typed stays on the record and is named underneath, so nothing is hidden. */}
      {moved && movedNow && movedWords && (
        <View style={[styles.band, { borderColor: movedWords.color }]} accessibilityLiveRegion="polite">
          <Text style={[styles.bandWord, { color: movedWords.color }]}>
            {movedWords.icon} {movedWords.word}
            {moved.typed ? (byHq ? ' (corrected by HQ)' : ' (suggestion used)') : ''}
          </Text>
          <Text style={styles.bandDetail}>
            {movedNow.offsetM.toFixed(1)} m from {transect.properties.transectId}, {Math.round(movedNow.chainageM)} m along.
          </Text>
          {moved.typed && check && (
            <Text style={styles.flag}>
              You typed {raw.trim()}, which was {distance(check.offsetM)} off. That is kept on the record.
            </Text>
          )}
          {!moved.typed && <Text style={styles.flag}>From the {moved.source === 'garmin-gpx' ? 'Garmin file' : "phone's GPS"}.</Text>}
        </View>
      )}

      {!moved && check && words && (
        <View style={[styles.band, { borderColor: words.color }]} accessibilityLiveRegion="polite">
          <Text style={[styles.bandWord, { color: words.color }]}>
            {words.icon} {words.word}
          </Text>
          <Text style={styles.bandDetail}>{words.detail}</Text>
          {check.flags.map((f) => (FLAG_WORDS[f] ? <Text key={f} style={styles.flag}>{FLAG_WORDS[f]}</Text> : null))}
        </View>
      )}

      {check && (
        <TransectStrip
          lengthM={transect.properties.lengthM}
          toleranceM={check.toleranceM}
          amberMultiplier={project.coordCheck.amberMultiplier}
          points={points}
          transectId={transect.properties.transectId}
        />
      )}

      {decision && decision.kind !== 'accepted-suggestion' && (
        <Text style={fs.small}>
          {decision.kind === 'kept-original' && 'Kept as typed.'}
          {decision.kind === 'override' && `Kept as typed. Reason: ${decision.reason}`}
          {decision.kind === 're-taken' && 'Re-taken from the GPS.'}
        </Text>
      )}

      {needsChoice && check.suggestions.length > 0 && (
        <View style={styles.gap}>
          <Text style={fs.label}>Did you mean?</Text>
          {check.suggestions.map((sg, i) => (
            <View key={`${sg.kind}-${i}`} style={styles.suggestion}>
              <Text style={styles.sgTitle}>
                {i + 1}. {sg.explain}
              </Text>
              <Text style={fs.small}>
                {sg.raw ? `${sg.raw} · ` : ''}
                {sg.offsetM.toFixed(1)} m from the line, {Math.round(sg.chainageM)} m along
              </Text>
              <Button label="Use this" onPress={() => onChange(acceptSuggestion(raw, format, accuracy, sg, ctx))} />
            </View>
          ))}
        </View>
      )}
      {needsChoice && check.suggestions.length === 0 && (
        <Text style={fs.small}>No single typing mistake puts this point on the line. Check the GPS reading.</Text>
      )}

      {needsChoice && !overriding && (
        <View style={styles.row}>
          <Button
            label="Re-take"
            kind="secondary"
            style={styles.flex}
            onPress={() => {
              setRetaking(true);
              setRaw('');
            }}
          />
          <Button label="Keep as typed" kind="secondary" style={styles.flex} onPress={() => keep('kept-original')} />
        </View>
      )}
      {needsChoice && !overriding && (
        <Button label="Override with a reason" kind="secondary" onPress={() => setOverriding(true)} />
      )}
      {overriding && (
        <View style={styles.gap}>
          <TextInput
            style={[fs.input, fs.multiline]}
            multiline
            value={reason}
            placeholder="Why is this point right? e.g. animal was 40 m off the trail at a stream"
            placeholderTextColor={colors.dim}
            onChangeText={setReason}
          />
          <Button label="Save override" onPress={() => keep('override')} disabled={!reason.trim()} />
        </View>
      )}

      <Text style={fs.small}>GPS accuracy (m), if the GPS shows it</Text>
      <NumberInput
        value={accuracy}
        onChange={(a) => {
          setAccuracy(a);
          emit(raw, format, a);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  gap: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 1 },
  band: { borderWidth: 3, borderRadius: 12, padding: 12, gap: 4 },
  bandWord: { fontSize: 22, fontWeight: '800' },
  bandDetail: { fontSize: 17, color: colors.ink },
  flag: { fontSize: 15, color: colors.ink },
  suggestion: { borderWidth: 2, borderColor: colors.green, borderRadius: 12, padding: 12, gap: 8 },
  sgTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
});
