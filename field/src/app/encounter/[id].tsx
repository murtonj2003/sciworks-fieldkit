// One animal. Every field comes from the template + team overlay; every tap is saved. Nothing blocks a save.
import { checkRanges, type Encounter, type Transect } from '@sciworks/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chips, FieldInput, FieldLabel, Hint, NumberInput, s as fs } from '@/components/fields';
import { LocationEntry } from '@/components/LocationEntry';
import { Button, Card, H2, P, colors } from '@/components/ui';
import { newId } from '@/db/meta';
import { listPhotos, photoUri, savePhoto } from '@/db/photos';
import { listRecords } from '@/db/records';
import { useRecord } from '@/hooks/useRecord';
import { pickPhoto, takePhoto, type ShotResult } from '@/lib/camera';
import { clockOf, nowIso } from '@/lib/time';
import { GROUPS, byGroup, effectiveFields, getPath, setPath, type EffectiveField } from '@/model/form';
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
  const { record: e, update, sealNow } = useRecord<LocalEncounter>(id);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const tz = project?.timeZone;
  const now = () => nowIso(tz);

  const fields = useMemo(() => (template ? effectiveFields(template, overlay, 'encounter') : []), [template, overlay]);
  if (!e || !project || !template || !person) return <P>Animal not found.</P>;

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
            <Text style={[styles.species, !e.taxon.scientificName && styles.unset]}>
              {e.taxon.scientificName ?? (e.taxon.unidentified ? 'Unidentified (photo for later)' : 'Not chosen yet')}
            </Text>
            {taxon?.commonName && <Text style={fs.small}>{taxon.commonName} · {taxon.family}</Text>}
            {e.taxon.idBasis === 'scale-key' && <Text style={fs.small}>Suggested by the scale key, chosen by you</Text>}
            <View style={styles.row}>
              <Button label="Pick species" style={styles.flex} onPress={() => router.push({ pathname: '/species/[id]', params: { id } })} />
              <Button label="Scale key" kind="secondary" style={styles.flex} onPress={() => router.push({ pathname: '/key/[id]', params: { id } })} />
            </View>
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
            <View style={styles.thumbs}>
              {photos.map((p) => (
                <Image key={p.photoId} source={{ uri: photoUri(p.path) }} style={styles.thumb} contentFit="cover" />
              ))}
            </View>
            <View style={styles.row}>
              <Button label="Take photo" style={styles.flex} onPress={() => addPhoto(takePhoto)} />
              <Button label="From library" kind="secondary" style={styles.flex} onPress={() => addPhoto(pickPhoto)} />
            </View>
            <Hint text={photoError} />
          </View>
        );
      case 'location':
        return transect ? (
          <LocationEntry
            location={e.location}
            transect={transect}
            project={project}
            personId={person.personId}
            now={now}
            previousChainageM={previousChainageM}
            typedDistanceM={e.distanceAlongM?.source === 'typed' ? e.distanceAlongM.value : undefined}
            onChange={({ location, autoDistanceM }) =>
              update((r) => {
                const next = { ...r, location };
                if (autoDistanceM !== undefined && r.distanceAlongM?.source !== 'typed') {
                  next.distanceAlongM = { value: autoDistanceM, source: 'auto' };
                }
                return next;
              })
            }
          />
        ) : (
          <Hint text={`Transect ${e.transectId} is not on this phone.`} />
        );
      default:
        return undefined;
    }
  };

  const renderField = (f: EffectiveField) => {
    if (f.key === 'distanceAlongM') {
      return (
        <View key={f.key} style={fs.field}>
          <FieldLabel field={f} />
          <NumberInput
            value={e.distanceAlongM?.value}
            onChange={(v) => set('distanceAlongM', v === undefined ? undefined : { value: v, source: 'typed' })}
          />
          <Text style={fs.small}>
            {e.distanceAlongM?.source === 'auto'
              ? 'Filled in from the checked point. Type over it to change.'
              : e.distanceAlongM
                ? 'Typed by you.'
                : 'Fills in automatically once the point is on the line.'}
          </Text>
        </View>
      );
    }
    const sp = special(f);
    return <FieldInput key={f.key} field={f} value={getPath(e, f.path)} onChange={(v) => set(f.path, v)} nowIso={now} special={sp} />;
  };

  const section = (group: string) => {
    const list = byGroup(fields, [group]);
    if (list.length === 0) return null;
    return (
      <View key={group} style={styles.section}>
        <H2>{GROUPS.find((g) => g.key === group)?.label ?? group}</H2>
        {list.map(renderField)}
        {group === 'measurements' &&
          rangeWarnings.map((w) => <Hint key={w.fieldPath + w.message} text={w.message} />)}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {taxon?.dangerous && (
          <View style={styles.dangerBanner} accessibilityRole="alert">
            <Text style={styles.dangerText}>⚠ VENOMOUS: {taxon.scientificName}. Do not handle without the protocol.</Text>
          </View>
        )}
        <Card>
          <P dim>
            {e.transectId} · seen {clockOf(e.observedAt)} · form v{e.coreVersion}
            {e.overlayRev ? ` + team change ${e.overlayRev}` : ''}
          </P>
          {missing.length > 0 && <P dim>Still to fill in for HQ: {missing.join(', ')}</P>}
        </Card>
        {['animal', 'measurements', 'location', 'scales', 'extras', 'notes'].map(section)}
        {e.status === 'void' && <P>This record is voided. It is kept, and HQ will see it as voided.</P>}
      </ScrollView>
      <View style={styles.bottom}>
        <Button
          label="Done"
          onPress={() => {
            sealNow();
            router.back();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFFFFF' },
  page: { padding: 16, gap: 10, paddingBottom: 32 },
  section: { gap: 6 },
  bottom: { padding: 16, borderTopWidth: 1, borderTopColor: '#DDDDDD' },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  species: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: colors.ink },
  unset: { fontStyle: 'normal', color: colors.dim },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: 8, backgroundColor: '#EEEEEE' },
  dangerBanner: { backgroundColor: colors.red, borderRadius: 12, padding: 14 },
  dangerText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
});
