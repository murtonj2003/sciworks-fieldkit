// P2b / P3 · One walk of one transect, rebuilt to comp 1D (fidelity pass, Sat 20:40): the title in the top bar, one
// quiet line for date, sun and moon, then grey trays holding white cards of one-line rows (short bold label, the
// chips scroll sideways, the chosen one black), quick weather as the first row, the protocol warning as its own
// amber block with the button beside the words, Animals as one-line rows, the map last. One black Add animal in
// the bottom bar; Finish survey sits at the end of the page.
import type { WeatherBlock } from '@sciworks/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FieldInput } from '@/components/fields';
import { BandMarker, Icon } from '@/components/Icon';
import { TransectMap } from '@/components/TransectMap';
import { TierTag } from '@/components/UploadStatus';
import { uploadTier } from '@/db/status';
import { BottomBar, Button, Group, Hint, SavedMark, StatusChip, T, TrayTitle, type Status } from '@/components/ui';
import { latestReview } from '@/db/feedback';
import { createFreshDraft, listRecords } from '@/db/records';
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
  page: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 24, gap: 12 },
  info: { gap: 3, marginHorizontal: 6, marginBottom: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  infoText: { ...type.sub, color: t.ink2 },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  rsep: { height: 1, backgroundColor: t.hair },
  qrow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 58, paddingVertical: 8, paddingLeft: 12 },
  qchip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: t.hair, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' },
  arow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 14 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 46 },
  empty: { backgroundColor: t.card, borderRadius: radius.card, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center', gap: 4 },
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
    createFreshDraft(e); // counted only once something is entered
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

  const groupLabel = (key: string) => GROUPS.find((g) => g.key === key)?.label ?? key;

  /** A grey tray with its heading inside and one white card of one-line rows; choices before numbers (comp 1D). */
  const renderGroup = (group: string, first?: ReactNode) => {
    const list = groupFields(group).sort((a, b) => Number(a.type === 'number') - Number(b.type === 'number'));
    if (list.length === 0) return null;
    if (list.every((f) => f.type === 'text')) {
      return (
        <Group style={{ gap: 6 }}>
          <TrayTitle>{groupLabel(group)}</TrayTitle>
          {list.map((f) => (
            <FieldInput key={f.key} field={f} value={getPath(survey, f.path)} onChange={(v) => set(f.path, v)} nowIso={now} />
          ))}
        </Group>
      );
    }
    return (
      <Group style={{ gap: 6 }}>
        <TrayTitle>{groupLabel(group)}</TrayTitle>
        <View style={s.list}>
          {first}
          {list.map((f, i) => (
            <View key={f.key}>
              {(i > 0 || first) && <View style={s.rsep} />}
              <FieldInput field={f} value={getPath(survey, f.path)} onChange={(v) => set(f.path, v)} nowIso={now} compact />
            </View>
          ))}
        </View>
      </Group>
    );
  };

  const presetsFor = (block: 'weatherStart' | 'weatherEnd') =>
    block === 'weatherEnd' ? weatherPresets(survey.weatherStart, 'Same as at start') : weatherPresets(previous?.weatherStart);
  const matches = (w: LocalWeather | undefined, p: WeatherPreset) =>
    !!w && (Object.keys(p.weather) as (keyof WeatherBlock)[]).every((k) => w[k] === p.weather[k as keyof typeof p.weather]);

  /** Quick weather as the card's first row: one tap fills cloud, rain and wind, then fix anything that differs. */
  const presetRow = (block: 'weatherStart' | 'weatherEnd') => (
    <View style={s.qrow}>
      <Text style={[type.title, { fontSize: 16, color: t.ink, width: 84, flexShrink: 0 }]}>Quick</Text>
      <ScrollView horizontal style={{ flex: 1 }} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingRight: 16 }} accessibilityRole="radiogroup" accessibilityLabel="Quick weather: tap one, then fix anything that differs">
        {presetsFor(block).map((p) => {
          const on = matches(survey[block], p);
          const [title] = p.label.split(' · ');
          return (
            <Pressable
              key={p.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={p.label}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => update((r) => ({ ...r, [block]: { ...(r[block] ?? { at: now() }), ...p.weather } }))}
              style={({ pressed }) => [s.qchip, on && { backgroundColor: t.pri, borderColor: t.pri }, pressed && { backgroundColor: on ? t.priPress : t.secPress }]}
            >
              <Text style={[type.body, { fontSize: 15, fontWeight: on ? '600' : '500', color: on ? t.onPri : t.ink }]}>{title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const animalRow = (a: LocalEncounter, i: number) => {
    const name = a.taxon.scientificName;
    const loc = a.location;
    const fixed = loc?.check.decision?.kind === 'accepted-suggestion' || !!loc?.original;
    const band = loc ? (fixed ? 'green' : loc.check.band) : 'none';
    const review = latestReview(a.id)?.status as Status | undefined;
    const incomplete = missingForHq(a);
    const bits = [clockOf(a.observedAt), a.svl ? `SVL ${thousands(a.svl.value)} mm` : null, a.distanceAlongM ? `${thousands(a.distanceAlongM.value)} m along` : null, loc ? null : 'no location yet'].filter(Boolean);
    const where = loc ? (fixed ? 'on the line, fixed' : loc.check.band === 'green' ? 'on the line' : loc.check.band === 'amber' ? 'near the line' : loc.check.band === 'red' ? 'off the line' : 'outside the project area') : '';
    return (
      <View key={a.id}>
        {i > 0 && <View style={s.sep} />}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/encounter/[id]', params: { id: a.id } })}
          style={({ pressed }) => [s.arow, pressed && { backgroundColor: t.secPress }]}
        >
          <BandMarker band={band} size={20} />
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <T italic={!!name} dim={!name} numberOfLines={1}>
              {name ?? (a.taxon.unidentified ? 'Unidentified' : 'Not chosen yet')}
            </T>
            <T v="sub" dim numberOfLines={1} style={{ flexShrink: 1 }}>
              {[...bits, where].filter(Boolean).join(' · ')}
            </T>
          </View>
          {review ? <StatusChip status={review} /> : <TierTag tier={uploadTier(a.id)} />}
          <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={s.wrap}>
      <Stack.Screen options={{ title: `${survey.transectId} · ${night ? 'Night' : 'Day'} survey`, headerRight: () => <SavedMark /> }} />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={s.info}>
          <Text style={s.infoText}>
            {shortDate(survey.date)} · started {clockOf(survey.startedAt)}
            {finished ? ` · finished ${clockOf(survey.finishedAt)}` : ''} · {survey.surveyorCount} {survey.surveyorCount === 1 ? 'surveyor' : 'surveyors'}
            {survey.effortPersonHours !== undefined ? ` · ${survey.effortPersonHours} person-hours` : ''}
          </Text>
          {survey.astro && (
            <View style={s.infoRow} accessibilityLabel={`Sunrise ${clockOf(survey.astro.sunrise)}, sunset ${clockOf(survey.astro.sunset)}. Moon ${survey.astro.moonIlluminationPct}% lit, ${survey.astro.moonAboveHorizonAtStart ? 'up' : 'not up'} at start.`}>
              <Icon name="sun" size={15} color={t.ink2} />
              <Text style={s.infoText}>
                {clockOf(survey.astro.sunrise)}–{clockOf(survey.astro.sunset)}
              </Text>
              <Icon name="moon" size={15} color={t.ink2} />
              <Text style={s.infoText}>
                {survey.astro.moonIlluminationPct}% lit, {survey.astro.moonAboveHorizonAtStart ? 'up' : 'not up'}
                {night ? ` · ${survey.astro.minutesAfterSunsetAtStart} min after sunset` : ''}
              </Text>
            </View>
          )}
        </View>

        {renderGroup('weather-start', presetRow('weatherStart'))}
        {hits.map((h) => (
          <Hint
            key={h.code}
            side
            actions={
              <Button
                label="Yes, carry on"
                kind="white"
                size={40}
                lines={1}
                onPress={() =>
                  update((r) => ({
                    ...r,
                    protocolWarnings: [...(r.protocolWarnings ?? []), { code: h.code, message: h.message, acknowledgedAt: now() }],
                  }))
                }
              />
            }
          >
            {h.message}
          </Hint>
        ))}

        {finished && renderGroup('weather-end', presetRow('weatherEnd'))}

        <Group style={{ gap: 6 }}>
          <TrayTitle>Animals ({animals.length})</TrayTitle>
          {animals.length > 0 ? (
            <View style={s.list}>{animals.map(animalRow)}</View>
          ) : (
            <View style={s.empty}>
              <View style={{ marginBottom: 6 }}>
                <Icon name="snake-coil" size={34} color={t.ink2} strokeWidth={1.4} />
              </View>
              <T v="title">No animals yet</T>
              <T v="sub" dim>
                Tap Add animal when you find one.
              </T>
            </View>
          )}
        </Group>

        {renderGroup('herp')}
        {renderGroup('extras')}
        {renderGroup('notes')}

        {transect && (
          <Group style={{ gap: 6 }}>
            <TrayTitle>Map</TrayTitle>
            <View style={[s.list, { paddingHorizontal: 6, paddingVertical: 4 }]}>
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
          </Group>
        )}

        {!finished && <Button label="Finish survey" kind="grey" size={56} icon="check" onPress={finish} />}
      </ScrollView>

      <BottomBar>
        {!finished ? (
          <Button label="Add animal" iconAfter="plus" size={64} onPress={addAnimal} />
        ) : (
          <Button label="Done" size={72} onPress={() => router.back()} />
        )}
      </BottomBar>
    </View>
  );
}
