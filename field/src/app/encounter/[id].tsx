// One animal. Every field comes from the template + team overlay; every tap is saved. Nothing blocks a save.
import { checkRanges, type Encounter, type Transect } from '@sciworks/shared';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Chips, FieldInput, FieldLabel, Hint, NumberInput, useFieldStyles } from '@/components/fields';
import { BandMarker, Icon } from '@/components/Icon';
import { LocationEntry } from '@/components/LocationEntry';
import type { IconName } from '@/components/sprite';
import { BottomBar, Button, Group, Pair, Row, SectionTitle, T, Tag } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';
import { newId } from '@/db/meta';
import { listPhotos, photoUri, savePhoto } from '@/db/photos';
import { listRecords } from '@/db/records';
import { useRecord } from '@/hooks/useRecord';
import { pickPhoto, recoverPendingPhoto, takePhoto, type ShotResult } from '@/lib/camera';
import { clockOf, nowIso } from '@/lib/time';
import { GROUPS, byGroup, effectiveFields, getPath, setPath, type EffectiveField } from '@/model/form';
import { nextDistance } from '@/model/location';
import { missingForHq, type LocalEncounter } from '@/model/records';
import { useField } from '@/state/field';

const ID_BASIS = [
  { code: 'in-hand', label: 'In hand' },
  { code: 'visual', label: 'Seen only' },
  { code: 'photo-later', label: 'ID from photo later' },
] as const;

export default function EncounterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const field = useField();
  const { project, template, overlay, transects, pack, person } = field;
  const { record: e, update, sealNow } = useRecord<LocalEncounter>(id, { owner: true });
  const st = useStyles();
  const fs = useFieldStyles();
  const { t } = useTheme();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const tz = project?.timeZone;
  const now = () => nowIso(tz);

  const fields = useMemo(() => (template ? effectiveFields(template, overlay, 'encounter') : []), [template, overlay]);

  // Android can close the app while the camera is open; if so, the photo is picked up here when we come back.
  useEffect(() => {
    if (id) addPhoto(() => recoverPendingPhoto(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!e || !project || !template || !person) return <T>Animal not found.</T>;

  const transect = transects?.features.find((f) => f.properties.transectId === e.transectId) as Transect | undefined;
  const taxon = pack?.taxa.find((t) => t.taxonId === e.taxon.taxonId);
  const photos = listPhotos(e.id);
  const missing = missingForHq(e);
  const rangeWarnings = pack && e.taxon.taxonId ? checkRanges(e as Encounter, pack) : [];
  const previousChainageM = listRecords<LocalEncounter>('encounter')
    .filter((o) => o.surveyId === e.surveyId && o.id !== e.id && o.status === 'active' && o.observedAt < e.observedAt)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
    .map((o) => o.distanceAlongM?.value ?? o.location?.check.chainageM)
    .find((c) => c !== undefined);

  const set = (path: string, value: unknown) => update((r) => setPath(r, path, value));
  const siblings = listRecords<LocalEncounter>('encounter')
    .filter((o) => o.surveyId === e.surveyId && o.status === 'active')
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const number = Math.max(1, siblings.findIndex((o) => o.id === e.id) + 1);
  // While the "Did you mean?" card waits, Done steps back to grey so Use this is the one black pill (never blocks).
  const choicePending = !!e.location && e.location.check.band !== 'green' && !e.location.check.decision && !e.location.original;

  async function addPhoto(get: () => Promise<ShotResult | { error: string } | null>) {
    setPhotoError(null);
    try {
      const shot = await get();
      if (!shot) return;
      if ('error' in shot) return setPhotoError(shot.error);
      const photoId = newId();
      savePhoto({ photoId, recordId: id, bytes: shot.bytes, widthPx: shot.width, heightPx: shot.height, takenAt: now(), role: 'dorsal' });
      update((r) => ({ ...r, photoIds: [...r.photoIds, photoId] }));
    } catch (err) {
      setPhotoError(String(err));
    }
  }

  const special = (f: EffectiveField) => {
    switch (f.type) {
      case 'taxon':
        return (
          <View style={fs.gap}>
            <Row style={{ gap: 4 }}>
              <Text style={fs.label}>{f.label}</Text>
              <Text style={[st.spName, !e.taxon.scientificName && st.spUnset]}>
                {e.taxon.scientificName ?? (e.taxon.unidentified ? 'Unidentified (photo for later)' : 'Not chosen yet')}
              </Text>
              {!e.taxon.scientificName && f.help ? <Text style={[fs.help, { marginHorizontal: 0 }]}>{f.help}</Text> : null}
              {taxon?.commonName && (
                <T v="sub" dim>
                  {taxon.commonName} · {taxon.family}
                </T>
              )}
              {taxon?.dangerous && <Tag label="VENOMOUS" venomous />}
              {e.taxon.idBasis === 'scale-key' && (
                <T v="sub" dim>
                  Suggested by the scale key, chosen by you
                </T>
              )}
            </Row>
            <Pair>
              <Button label="Pick species" kind="white" size={56} icon="search" style={{ flex: 1, paddingHorizontal: 12 }} onPress={() => router.push({ pathname: '/species/[id]', params: { id } })} />
              <Button label="Scale key" kind="white" size={56} icon="key" style={{ flex: 1, paddingHorizontal: 12 }} onPress={() => router.push({ pathname: '/key/[id]', params: { id } })} />
            </Pair>
            <Text style={[fs.label, { marginTop: 4, marginHorizontal: 4 }]}>ID basis</Text>
            <Chips
              options={ID_BASIS.map((b) => ({ code: b.code, label: b.label }))}
              value={e.taxon.idBasis === 'scale-key' ? undefined : e.taxon.idBasis}
              onChange={(v) => v && update((r) => ({ ...r, taxon: { ...r.taxon, idBasis: v as LocalEncounter['taxon']['idBasis'] } }))}
            />
          </View>
        );
      case 'photos':
        return (
          <View style={fs.gap}>
            {photos.length > 0 && (
              <View style={st.thumbs}>
                {photos.map((p) => (
                  <Image key={p.photoId} source={{ uri: photoUri(p.path) }} style={st.thumb} contentFit="cover" />
                ))}
              </View>
            )}
            <Pair>
              <Button label="Take photo" kind="white" size={56} icon="camera" style={{ flex: 1 }} onPress={() => addPhoto(() => takePhoto(id))} />
              <Button label="From library" kind="white" size={56} style={{ flex: 1 }} onPress={() => addPhoto(pickPhoto)} />
            </Pair>
            <Hint text={photoError} />
          </View>
        );
      default:
        return undefined;
    }
  };

  const distanceField = (f: EffectiveField) => (
    <View key={f.key} style={fs.field}>
      <FieldLabel field={f} />
      <NumberInput
        value={e.distanceAlongM?.value}
        unit="m"
        accessibilityLabel={f.label}
        onChange={(v) => set('distanceAlongM', v === undefined ? undefined : { value: v, source: 'typed' })}
      />
      <Text style={fs.help}>
        {e.distanceAlongM?.source === 'auto'
          ? 'Filled in from the checked point. Type over it to change.'
          : e.distanceAlongM
            ? 'Typed by you.'
            : 'Fills in automatically once the point is on the line.'}
      </Text>
    </View>
  );

  const renderField = (f: EffectiveField) => {
    const sp = special(f);
    if (f.type === 'taxon') return <View key={f.key}>{sp}</View>;
    return <FieldInput key={f.key} field={f} value={getPath(e, f.path)} onChange={(v) => set(f.path, v)} nowIso={now} special={sp} />;
  };

  // Comp P4 has no icons on Animal / Measurements; P6 gives Location and Scale counts theirs.
  const SECTION_ICON: Record<string, IconName> = {
    location: 'map-pin',
    scales: 'key',
  };
  const SECTION_LABEL: Record<string, string> = { location: 'Location' }; // DESIGN-HANDOFF §1.2: "Where" → "Location"

  const section = (group: string) => {
    const list = byGroup(fields, [group]);
    if (list.length === 0) return null;
    const title = SECTION_LABEL[group] ?? GROUPS.find((g) => g.key === group)?.label ?? group;
    if (group === 'location') {
      const loc = list.find((f) => f.type === 'location');
      const dist = list.find((f) => f.key === 'distanceAlongM');
      return (
        <View key={group}>
          <SectionTitle icon={SECTION_ICON[group]}>{title}</SectionTitle>
          {loc && transect ? (
            <LocationEntry
              location={e.location}
              transect={transect}
              project={project}
              personId={person.personId}
              now={now}
              previousChainageM={previousChainageM}
              typedDistanceM={e.distanceAlongM?.source === 'typed' ? e.distanceAlongM.value : undefined}
              distanceField={dist ? distanceField(dist) : undefined}
              onChange={({ location, distance }) =>
                update((r) => {
                  const next = { ...r, location };
                  const d = nextDistance(r.distanceAlongM, distance);
                  if (d) next.distanceAlongM = d;
                  else delete next.distanceAlongM;
                  return next;
                })
              }
            />
          ) : (
            <Hint text={`Transect ${e.transectId} is not on this phone.`} />
          )}
        </View>
      );
    }
    return (
      <View key={group}>
        <SectionTitle icon={SECTION_ICON[group]}>{title}</SectionTitle>
        <Group style={{ gap: 10, paddingVertical: 10 }}>{list.map(renderField)}</Group>
        {group === 'measurements' &&
          rangeWarnings.map((w) => (
            <View key={w.fieldPath + w.message} style={{ marginTop: 8 }}>
              <Hint text={w.message} />
            </View>
          ))}
      </View>
    );
  };

  return (
    <View style={st.wrap}>
      <Stack.Screen
        options={{
          title: `Animal ${number} · ${e.transectId}`,
          headerRight: () => (
            <View style={st.saved} accessibilityLabel="Saved on this phone">
              <Icon name="check" size={18} color={t.onMark} strokeWidth={2.25} />
              <Text style={st.savedText}>Saved</Text>
            </View>
          ),
        }}
      />
      {taxon?.dangerous && (
        <View style={st.venom} accessibilityRole="alert">
          <Tag label="VENOMOUS" venomous />
          <Text style={st.venomText}>
            <Text style={{ fontStyle: 'italic' }}>{taxon.scientificName}</Text>. Do not handle without the protocol.
          </Text>
        </View>
      )}
      <ScrollView contentContainerStyle={st.page} keyboardShouldPersistTaps="handled">
        <View style={st.info}>
          <Icon name="clock" size={16} color={t.ink2} />
          <Text style={st.infoText}>
            seen {clockOf(e.observedAt)} · form v{e.coreVersion}
            {e.overlayRev ? ` + team change ${e.overlayRev}` : ''}
          </Text>
        </View>
        {missing.length > 0 && (
          <View style={st.todo}>
            <View style={{ marginTop: 1 }}>
              <BandMarker band="none" size={18} />
            </View>
            <Text style={st.todoText}>
              <Text style={{ fontWeight: '600' }}>Still to fill in for HQ:</Text> {missing.join(', ')}
            </Text>
          </View>
        )}
        {['animal', 'measurements', 'location', 'scales', 'extras', 'notes'].map(section)}
        {e.status === 'void' && <T dim>This record is voided. It is kept, and HQ will see it as voided.</T>}
      </ScrollView>
      <BottomBar>
        <Button
          label="Done"
          kind={choicePending ? 'grey' : 'primary'}
          size={choicePending ? 56 : 64}
          onPress={() => {
            sealNow();
            router.back();
          }}
        />
      </BottomBar>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginHorizontal: 4, marginBottom: 8 },
  infoText: { ...type.sub, color: t.ink2, flex: 1 },
  todo: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingTop: 10, paddingHorizontal: 14, paddingBottom: 11, borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.ink2 },
  todoText: { ...type.sub, color: t.ink, flex: 1 },
  spName: { fontSize: 22, fontWeight: '700', fontStyle: 'italic', letterSpacing: -0.2, lineHeight: 26, color: t.ink },
  spUnset: { fontStyle: 'normal', fontWeight: '600', color: t.ink2 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: { width: 96, height: 96, borderRadius: radius.card, backgroundColor: t.card },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  savedText: { ...type.sub, color: t.ink2 },
  venom: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.offTint, paddingVertical: 10, paddingHorizontal: 16 },
  venomText: { ...type.sub, color: t.offTintInk, flex: 1, fontWeight: '600' },
}));
