// One walk of one transect. Weather in two taps, sun and moon already filled in, the animals, then Finish.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chips, FieldInput } from '@/components/fields';
import { TransectMap } from '@/components/TransectMap';
import { Button, Card, H2, P, colors } from '@/components/ui';
import { latestReview } from '@/db/feedback';
import { listRecords, saveDraftNow, seal } from '@/db/records';
import { useRecord } from '@/hooks/useRecord';
import { clockOf, nowIso } from '@/lib/time';
import { newEncounter } from '@/model/factory';
import { GROUPS, byGroup, effectiveFields, getPath, setPath, withDefaults } from '@/model/form';
import { missingForHq, type LocalEncounter, type LocalSurvey } from '@/model/records';
import { NIGHT_ONLY_PATHS, effortPersonHours, isNight, protocolHits, weatherPresets } from '@/model/survey';
import { useField } from '@/state/field';

const reviewWord = (status: string | undefined) =>
  status === 'approved' ? ' · HQ approved' : status === 'flagged' ? ' · HQ flagged' : status === 'rejected' ? ' · HQ rejected' : status === 'edited' ? ' · changed since HQ review' : '';

export default function SurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const field = useField();
  const { project, template, overlay, person, transects } = field;
  const { record: survey, update } = useRecord<LocalSurvey>(id);
  const tz = project?.timeZone;
  const now = () => nowIso(tz);

  const fields = useMemo(() => (template ? effectiveFields(template, overlay, 'survey') : []), [template, overlay]);
  const animals = listRecords<LocalEncounter>('encounter')
    .filter((e) => e.surveyId === id && e.status === 'active')
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const previous = listRecords<LocalSurvey>('survey')
    .filter((s) => s.id !== id && s.weatherStart?.cloud)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

  if (!survey || !project || !template || !person) return <P>Survey not found.</P>;
  const transect = transects?.features.find((f) => f.properties.transectId === survey.transectId);
  const finished = !!survey.finishedAt;
  const set = (path: string, value: unknown) => update((r) => setPath(r, path, value));
  const hits = protocolHits(template.protocolRules, survey).filter(
    (h) => !survey.protocolWarnings?.some((w) => w.code === h.code),
  );
  const missing = missingForHq(survey);

  function addAnimal() {
    if (!project || !template || !person || !survey) return;
    const ctx = { project, template, person, deviceId: field.deviceId, overlayRev: overlay?.overlayRev ?? 0 };
    const e = withDefaults(newEncounter(ctx, survey), effectiveFields(template, overlay, 'encounter'));
    saveDraftNow(e);
    seal(e.id);
    router.push({ pathname: '/encounter/[id]', params: { id: e.id } });
  }

  function finish() {
    const at = now();
    update((r) => ({
      ...r,
      finishedAt: at,
      effortPersonHours: effortPersonHours(r, at),
      weatherEnd: { ...(r.weatherEnd ?? {}), at },
    }));
  }

  const renderGroup = (group: string) =>
    byGroup(fields, [group])
      .filter((f) => f.key !== 'finishedAt')
      .filter((f) => !NIGHT_ONLY_PATHS.has(f.path) || isNight(survey) || getPath(survey, f.path) !== undefined)
      .map((f) => (
        <FieldInput key={f.key} field={f} value={getPath(survey, f.path)} onChange={(v) => set(f.path, v)} nowIso={now} />
      ));

  const presetsFor = (block: 'weatherStart' | 'weatherEnd') =>
    block === 'weatherEnd' ? weatherPresets(survey.weatherStart, 'Same as at start') : weatherPresets(previous?.weatherStart);

  const presetRow = (block: 'weatherStart' | 'weatherEnd') => (
    <View style={styles.presets}>
      <Text style={styles.small}>Quick weather: tap one, then fix anything that differs</Text>
      <Chips
        options={presetsFor(block).map((p, i) => ({ code: String(i), label: p.label }))}
        value={undefined}
        onChange={(v) => {
          const p = presetsFor(block)[Number(v)];
          if (p) update((r) => ({ ...r, [block]: { ...(r[block] ?? { at: now() }), ...p.weather } }));
        }}
      />
    </View>
  );

  const groupLabel = (key: string) => GROUPS.find((g) => g.key === key)?.label ?? key;

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Card>
          <H2>
            {survey.transectId} · {isNight(survey) ? 'Night survey' : 'Day survey'}
          </H2>
          <P dim>
            {survey.date} · started {clockOf(survey.startedAt)}
            {finished ? ` · finished ${clockOf(survey.finishedAt)}` : ''} · {survey.surveyorCount} {survey.surveyorCount === 1 ? 'surveyor' : 'surveyors'}
            {survey.effortPersonHours !== undefined ? ` · ${survey.effortPersonHours} person-hours` : ''}
          </P>
          {survey.astro && (
            <P dim>
              ☀ Sunrise {clockOf(survey.astro.sunrise)} · sunset {clockOf(survey.astro.sunset)} · 🌙 {survey.astro.moonIlluminationPct}%
              lit, {survey.astro.moonAboveHorizonAtStart ? 'up' : 'not up'} at start
              {isNight(survey) ? ` · ${survey.astro.minutesAfterSunsetAtStart} min after sunset` : ''}
            </P>
          )}
          {missing.length > 0 && <P dim>Still to fill in for HQ: {missing.join(', ')}</P>}
        </Card>
        {transect && (
          <TransectMap
            transect={transect}
            points={animals.flatMap((a, i) =>
              a.location
                ? [{
                    lat: a.location.lat,
                    lon: a.location.lon,
                    band: a.location.check.decision?.kind === 'accepted-suggestion' ? ('green' as const) : a.location.check.band,
                    label: String(i + 1),
                  }]
                : [],
            )}
          />
        )}

        <H2>{groupLabel('weather-start')}</H2>
        {presetRow('weatherStart')}
        {renderGroup('weather-start')}

        {hits.map((h) => (
          <Card key={h.code} style={styles.warn}>
            <P>⚠ {h.message}</P>
            <Button
              label="Yes, carry on"
              kind="secondary"
              onPress={() =>
                update((r) => ({
                  ...r,
                  protocolWarnings: [...(r.protocolWarnings ?? []), { code: h.code, message: h.message, acknowledgedAt: now() }],
                }))
              }
            />
          </Card>
        ))}

        {byGroup(fields, ['herp']).length > 0 && <H2>{groupLabel('herp')}</H2>}
        {renderGroup('herp')}
        {byGroup(fields, ['extras']).length > 0 && <H2>{groupLabel('extras')}</H2>}
        {renderGroup('extras')}

        <H2>Animals ({animals.length})</H2>
        {animals.map((a) => {
          const name = a.taxon.scientificName ?? (a.taxon.unidentified ? 'Unidentified' : 'Species not set');
          const band = a.location?.check.band;
          return (
            <Pressable
              key={a.id}
              onPress={() => router.push({ pathname: '/encounter/[id]', params: { id: a.id } })}
              style={({ pressed }) => [styles.animal, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.animalName}>{name}</Text>
              <Text style={styles.small}>
                {clockOf(a.observedAt)}
                {a.svl ? ` · SVL ${a.svl.value} mm` : ''}
                {a.location?.check.decision?.kind === 'accepted-suggestion'
                  ? ' · ✓ fixed with "did you mean?"'
                  : band
                    ? ` · ${band === 'green' ? '✓ on the line' : band === 'amber' ? '⚠ near the line' : '✗ off the line'}`
                    : ' · no location yet'}
                {reviewWord(latestReview(a.id)?.status)}
              </Text>
            </Pressable>
          );
        })}

        {finished && (
          <>
            <H2>{groupLabel('weather-end')}</H2>
            {presetRow('weatherEnd')}
            {renderGroup('weather-end')}
          </>
        )}

        <H2>{groupLabel('notes')}</H2>
        {renderGroup('notes')}
      </ScrollView>

      <View style={styles.bottom}>
        {!finished && <Button label="+ Add animal" onPress={addAnimal} />}
        {!finished ? (
          <Button label="Finish survey" kind="secondary" onPress={finish} />
        ) : (
          <Button label="Done" onPress={() => router.back()} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFFFFF' },
  page: { padding: 16, gap: 10, paddingBottom: 24 },
  bottom: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#DDDDDD' },
  presets: { gap: 6 },
  small: { fontSize: 15, color: colors.dim },
  warn: { borderColor: colors.amber, borderWidth: 2, backgroundColor: '#FFF7E6' },
  animal: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, minHeight: 64, gap: 4 },
  animalName: { fontSize: 18, fontWeight: '700', fontStyle: 'italic', color: colors.ink },
});
