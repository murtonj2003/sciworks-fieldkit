// P2b / P3 · One walk of one transect. Weather in two taps, sun and moon already filled in, the animals, then
// Finish. Kit: head card with sun and moon lines, two-column quick-weather presets, fields in groups, protocol
// warnings as amber hints (never block), animal rows with band marks + status chips.
import type { WeatherBlock } from '@sciworks/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FieldInput } from '@/components/fields';
import { BandMarker, Icon } from '@/components/Icon';
import { TransectMap } from '@/components/TransectMap';
import { BottomBar, Button, DiscButton, Group, Hint, SavedMark, SectionTitle, StatusChip, T, Tag, type Status } from '@/components/ui';
import { latestReview } from '@/db/feedback';
import { listRecords, saveDraftNow, seal } from '@/db/records';
import { useRecord } from '@/hooks/useRecord';
import { clockOf, nowIso } from '@/lib/time';
import { newEncounter } from '@/model/factory';
import { GROUPS, byGroup, effectiveFields, getPath, setPath, withDefaults } from '@/model/form';
import { missingForHq, type LocalEncounter, type LocalSurvey, type LocalWeather } from '@/model/records';
import { NIGHT_ONLY_PATHS, effortPersonHours, isNight, protocolHits, weatherPresets, type WeatherPreset } from '@/model/survey';
import { useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1] ?? ''}`;
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  head: { backgroundColor: t.card, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 },
  headTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sky: { marginTop: 7, paddingTop: 7, borderTopWidth: 1, borderTopColor: t.hair, gap: 2 },
  skyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  skyText: { ...type.small, fontWeight: '400', color: t.ink2, flex: 1 },
  mapCard: { backgroundColor: t.card, borderRadius: radius.card, paddingHorizontal: 6, paddingVertical: 4 },
  help: { ...type.sub, color: t.ink2, marginHorizontal: 4, marginBottom: 8 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  preset: { width: '48.5%', minHeight: 56, borderRadius: radius.chip, backgroundColor: t.grey, paddingVertical: 8, paddingLeft: 14, paddingRight: 30, justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  presetOn: { backgroundColor: t.card, borderColor: t.ink },
  presetTitle: { ...type.title, color: t.ink },
  presetSub: { ...type.sub, color: t.ink2 },
  presetCheck: { position: 'absolute', top: 10, right: 10 },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  arow: { minHeight: 64, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 11, paddingBottom: 10, paddingHorizontal: 12 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 44 },
  aHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  empty: { backgroundColor: t.card, borderRadius: radius.card, paddingVertical: 22, paddingHorizontal: 20, alignItems: 'center', gap: 4 },
}));

export default function SurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const field = useField();
  const { project, template, overlay, person, transects } = field;
  const { record: survey, update } = useRecord<LocalSurvey>(id);
  const s = useStyles();
  const { t } = useTheme();
  const tz = project?.timeZone;
  const now = () => nowIso(tz);

  const fields = useMemo(() => (template ? effectiveFields(template, overlay, 'survey') : []), [template, overlay]);
  const animals = listRecords<LocalEncounter>('encounter')
    .filter((e) => e.surveyId === id && e.status === 'active')
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const previous = listRecords<LocalSurvey>('survey')
    .filter((x) => x.id !== id && x.weatherStart?.cloud)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

  if (!survey || !project || !template || !person) return <T>Survey not found.</T>;
  const transect = transects?.features.find((f) => f.properties.transectId === survey.transectId);
  const finished = !!survey.finishedAt;
  const night = isNight(survey);
  const set = (path: string, value: unknown) => update((r) => setPath(r, path, value));
  const hits = protocolHits(template.protocolRules, survey).filter((h) => !survey.protocolWarnings?.some((w) => w.code === h.code));
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

  const groupFields = (group: string) =>
    byGroup(fields, [group])
      .filter((f) => f.key !== 'finishedAt')
      .filter((f) => !NIGHT_ONLY_PATHS.has(f.path) || night || getPath(survey, f.path) !== undefined);

  const renderGroup = (group: string) => {
    const list = groupFields(group);
    if (list.length === 0) return null;
    return (
      <Group style={{ gap: 10, paddingVertical: 10 }}>
        {list.map((f) => (
          <FieldInput key={f.key} field={f} value={getPath(survey, f.path)} onChange={(v) => set(f.path, v)} nowIso={now} />
        ))}
      </Group>
    );
  };

  const presetsFor = (block: 'weatherStart' | 'weatherEnd') =>
    block === 'weatherEnd' ? weatherPresets(survey.weatherStart, 'Same as at start') : weatherPresets(previous?.weatherStart);
  const matches = (w: LocalWeather | undefined, p: WeatherPreset) =>
    !!w && (Object.keys(p.weather) as (keyof WeatherBlock)[]).every((k) => w[k] === p.weather[k as keyof typeof p.weather]);

  const presetRow = (block: 'weatherStart' | 'weatherEnd') => (
    <>
      <Text style={s.help}>Quick weather: tap one, then fix anything that differs</Text>
      <View style={s.presets} accessibilityRole="radiogroup" accessibilityLabel="Quick weather">
        {presetsFor(block).map((p) => {
          const on = matches(survey[block], p);
          const [title, ...rest] = p.label.split(' · ');
          return (
            <Pressable
              key={p.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={p.label}
              onPress={() => update((r) => ({ ...r, [block]: { ...(r[block] ?? { at: now() }), ...p.weather } }))}
              style={({ pressed }) => [s.preset, on && s.presetOn, pressed && { opacity: 0.85 }]}
            >
              <Text style={s.presetTitle}>{title}</Text>
              {rest.length > 0 && <Text style={s.presetSub}>{rest.join(' · ')}</Text>}
              {on && (
                <View style={s.presetCheck}>
                  <Icon name="check" size={20} color={t.ink} strokeWidth={2.25} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const groupLabel = (key: string) => GROUPS.find((g) => g.key === key)?.label ?? key;

  const animalRow = (a: LocalEncounter, i: number) => {
    const name = a.taxon.scientificName;
    const loc = a.location;
    const fixed = loc?.check.decision?.kind === 'accepted-suggestion' || !!loc?.original;
    const band = loc ? (fixed ? 'green' : loc.check.band) : 'none';
    const review = latestReview(a.id)?.status as Status | undefined;
    const incomplete = missingForHq(a);
    const bits = [clockOf(a.observedAt), a.svl ? `SVL ${thousands(a.svl.value)} mm` : null, a.distanceAlongM ? `${thousands(a.distanceAlongM.value)} m along` : null, loc ? null : 'no location yet'].filter(Boolean);
    const where = loc
      ? fixed
        ? 'On the line · fixed with “Did you mean?”'
        : loc.check.band === 'green'
          ? 'On the line'
          : loc.check.band === 'amber'
            ? 'Near the line'
            : loc.check.band === 'red'
              ? 'Off the line'
              : 'Outside the project area'
      : incomplete.length > 0
        ? `Still to fill in for HQ: ${incomplete.join(', ')}`
        : '';
    return (
      <View key={a.id}>
        {i > 0 && <View style={s.sep} />}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/encounter/[id]', params: { id: a.id } })}
          style={({ pressed }) => [s.arow, pressed && { backgroundColor: t.secPress }]}
        >
          <View style={{ marginTop: 1 }}>
            <BandMarker band={band} size={20} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={s.aHead}>
              <T italic={!!name} dim={!name} style={{ flex: 1 }}>
                {name ?? (a.taxon.unidentified ? 'Unidentified' : 'Not chosen yet')}
              </T>
              {review ? <StatusChip status={review} /> : incomplete.length > 0 ? <Tag label="incomplete" dashed /> : null}
            </View>
            <T v="sub" dim>
              {bits.join(' · ')}
            </T>
            {where ? (
              <T v="small" dim style={{ fontWeight: '400' }}>
                {where}
              </T>
            ) : null}
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={s.wrap}>
      <Stack.Screen options={{ title: 'Survey', headerRight: () => <SavedMark /> }} />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Group>
          <View style={s.head}>
            <View style={s.headTitle}>
              <Icon name={night ? 'moon' : 'sun'} size={20} color={t.ink2} />
              <T v="head" style={{ flex: 1 }}>
                {survey.transectId} · {night ? 'Night survey' : 'Day survey'}
              </T>
            </View>
            <T v="sub" dim style={{ marginTop: 3 }}>
              {shortDate(survey.date)} · started {clockOf(survey.startedAt)}
              {finished ? ` · finished ${clockOf(survey.finishedAt)}` : ''} · {survey.surveyorCount} {survey.surveyorCount === 1 ? 'surveyor' : 'surveyors'}
              {survey.effortPersonHours !== undefined ? ` · ${survey.effortPersonHours} person-hours` : ''}
            </T>
            {survey.astro && (
              <View style={s.sky}>
                <View style={s.skyRow}>
                  <Icon name="sun" size={16} color={t.ink} />
                  <Text style={s.skyText}>
                    Sunrise {clockOf(survey.astro.sunrise)} · sunset {clockOf(survey.astro.sunset)}
                  </Text>
                </View>
                <View style={s.skyRow}>
                  <Icon name="moon" size={16} color={t.ink} />
                  <Text style={s.skyText}>
                    Moon {survey.astro.moonIlluminationPct}% lit, {survey.astro.moonAboveHorizonAtStart ? 'up' : 'not up'} at start
                    {night ? ` · ${survey.astro.minutesAfterSunsetAtStart} min after sunset` : ''}
                  </Text>
                </View>
              </View>
            )}
          </View>
          {transect && (
            <View style={s.mapCard}>
              <TransectMap
                transect={transect}
                points={animals.flatMap((a, i) =>
                  a.location
                    ? [
                        {
                          lat: a.location.lat,
                          lon: a.location.lon,
                          band: a.location.check.decision?.kind === 'accepted-suggestion' || a.location.original ? ('green' as const) : a.location.check.band,
                          label: String(i + 1),
                        },
                      ]
                    : [],
                )}
              />
            </View>
          )}
        </Group>
        {missing.length > 0 && (
          <View style={{ marginTop: 8, marginHorizontal: 4 }}>
            <Tag label={`incomplete: ${missing.join(', ')}`} dashed />
          </View>
        )}

        <SectionTitle>{groupLabel('weather-start')}</SectionTitle>
        {presetRow('weatherStart')}
        {renderGroup('weather-start')}
        {hits.map((h) => (
          <View key={h.code} style={{ marginTop: 8 }}>
            <Hint
              actions={
                <View style={{ flexDirection: 'row' }}>
                  <Button
                    label="Yes, carry on"
                    kind="white"
                    size={48}
                    onPress={() =>
                      update((r) => ({
                        ...r,
                        protocolWarnings: [...(r.protocolWarnings ?? []), { code: h.code, message: h.message, acknowledgedAt: now() }],
                      }))
                    }
                  />
                </View>
              }
            >
              {h.message}
            </Hint>
          </View>
        ))}

        {groupFields('herp').length > 0 && <SectionTitle>{groupLabel('herp')}</SectionTitle>}
        {renderGroup('herp')}
        {groupFields('extras').length > 0 && <SectionTitle>{groupLabel('extras')}</SectionTitle>}
        {renderGroup('extras')}

        {finished && (
          <>
            <SectionTitle>{groupLabel('weather-end')}</SectionTitle>
            {presetRow('weatherEnd')}
            {renderGroup('weather-end')}
          </>
        )}

        <SectionTitle>Animals ({animals.length})</SectionTitle>
        <Group>
          {animals.length > 0 ? (
            <View style={s.list}>{animals.map(animalRow)}</View>
          ) : (
            <View style={s.empty}>
              <Icon name="snake" size={24} color={t.ink2} />
              <T v="title">No animals yet</T>
              <T v="sub" dim>
                Tap Add animal when you find one.
              </T>
            </View>
          )}
        </Group>

        <SectionTitle>{groupLabel('notes')}</SectionTitle>
        {renderGroup('notes')}
      </ScrollView>

      <BottomBar>
        {!finished ? (
          <>
            <DiscButton label="Add animal" onPress={addAnimal} />
            <Button label="Finish survey" kind="grey" size={56} onPress={finish} />
          </>
        ) : (
          <Button label="Done" size={72} onPress={() => router.back()} />
        )}
      </BottomBar>
    </View>
  );
}
