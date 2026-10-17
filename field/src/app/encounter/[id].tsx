// One animal. Every field comes from the template + team overlay; every tap is saved. Nothing blocks a save.
// Layout = comp 3C (fidelity pass, Sat 20:50): a new animal opens on the tile grid (not the long form), a black
// "Pick species" in the bottom bar until a species is set, big line drawings and green / amber / grey rings,
// Photos as named slots (Dorsal big; Ventral, Head, More), Done grey until every section is done.
import { checkRanges, type Encounter, type Transect } from '@sciworks/shared';
import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chips, FieldInput, FieldLabel, Hint, NumberInput, useFieldStyles } from '@/components/fields';
import { Icon } from '@/components/Icon';
import { LocationEntry } from '@/components/LocationEntry';
import { TransectThumb } from '@/components/TransectMap';
import Svg, { Circle } from 'react-native-svg';
import type { IconName } from '@/components/sprite';
import { BottomBar, Button, Group, Pair, Row, SectionTitle, T, Tag } from '@/components/ui';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';
import { getMeta, newId, setMeta } from '@/db/meta';
import { listPhotos, photoUri, savePhoto } from '@/db/photos';
import { listRecords } from '@/db/records';
import { useRecord } from '@/hooks/useRecord';
import { pickPhoto, recoverPendingPhoto, takePhoto, type ShotResult } from '@/lib/camera';
import { clockOf, nowIso } from '@/lib/time';
import { byGroup, effectiveFields, getPath, setPath, type EffectiveField } from '@/model/form';
import { nextDistance } from '@/model/location';
import { missingForHq, type LocalEncounter } from '@/model/records';
import { useField } from '@/state/field';

const ID_BASIS = [
  { code: 'in-hand', label: 'In hand' },
  { code: 'visual', label: 'Seen only' },
  { code: 'photo-later', label: 'ID from photo later' },
] as const;

type SecKey = 'animal' | 'photos' | 'measurements' | 'location' | 'scales' | 'extras' | 'notes';
/** The tiles, in the order a surveyor works (design pick 3C). Photos is its own tile so it is never buried. */
const SECTIONS: { key: SecKey; label: string; icon: IconName }[] = [
  { key: 'animal', label: 'Animal', icon: 'snake-coil' },
  { key: 'photos', label: 'Photos', icon: 'camera' },
  { key: 'measurements', label: 'Measure', icon: 'ruler' },
  { key: 'location', label: 'Location', icon: 'map-pin' },
  { key: 'scales', label: 'Scales', icon: 'scales' },
  { key: 'extras', label: 'Extras', icon: 'sliders' },
  { key: 'notes', label: 'Notes', icon: 'note' },
];
const PHOTO_TARGET = 3; // dorsal, ventral and head if you can
type Slot = 'dorsal' | 'ventral' | 'head' | 'other';
const SLOTS: { role: Slot; label: string }[] = [
  { role: 'dorsal', label: 'Dorsal' },
  { role: 'ventral', label: 'Ventral' },
  { role: 'head', label: 'Head' },
  { role: 'other', label: 'More' },
];
const filled = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

/** A progress ring with "n/m" inside: green when complete, amber when started, grey when empty (comp 3C, Jack's
 * pick: follow the mockup's colours). */
function Ring({ done, total }: { done: number; total: number }) {
  const { t } = useTheme();
  const r = 22;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, done / total) : 0;
  // The comp's softer ring colours by day (a bright amber and a lighter green on a neutral track); night keeps the
  // dimmed marks.
  const day = t.name === 'day';
  const color = frac >= 1 ? (day ? '#4E9F3D' : t.onMark) : day ? '#EDB338' : t.nearMark;
  const track = day ? '#DDDEE1' : t.track;
  return (
    <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${done} of ${total}`}>
      <Svg width={52} height={52} viewBox="0 0 52 52" style={{ position: 'absolute' }}>
        <Circle cx={26} cy={26} r={r} stroke={track} strokeWidth={4} fill="none" />
        {frac > 0 && (
          <Circle cx={26} cy={26} r={r} stroke={color} strokeWidth={4} fill="none" strokeDasharray={`${c * frac} ${c}`} strokeLinecap="round" transform="rotate(-90 26 26)" />
        )}
      </Svg>
      {/* A one-step section (Location) shows only the ring, as in the comp. */}
      {total !== 1 && (
        <Text style={[type.sub, { fontWeight: '600', color: frac > 0 ? t.ink : t.ink2, fontVariant: ['tabular-nums'] }]}>
          {done}/{total}
        </Text>
      )}
    </View>
  );
}

export default function EncounterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const field = useField();
  const { project, template, overlay, transects, pack, person } = field;
  const { record: e, update, sealNow } = useRecord<LocalEncounter>(id, { owner: true });
  const st = useStyles();
  const fs = useFieldStyles();
  const { t } = useTheme();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Design pick 3C: one section open at a time as a card above the tiles. Every animal opens on the grid; only a
  // pending "Did you mean?" keeps Location open.
  const [open, setOpen] = useState<SecKey | null>(() => {
    const loc = e?.location;
    return loc && loc.check.band !== 'green' && !loc.check.decision && !loc.original ? 'location' : null;
  });
  const tz = project?.timeZone;
  const now = () => nowIso(tz);

  const fields = useMemo(() => (template ? effectiveFields(template, overlay, 'encounter') : []), [template, overlay]);

  // Android can close the app while the camera is open; if so, the photo is picked up here when we come back.
  useEffect(() => {
    if (id) addPhoto(() => recoverPendingPhoto(id), (getMeta('pendingPhotoRole') as Slot | null) || undefined);
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

  /** Each photo fills a named slot: the one tapped, or the next empty of Dorsal, Ventral, Head (then More). */
  const named = (role: Slot) => photos.find((p) => p.role === role);
  const slotOf = (role: Slot) => {
    if (role !== 'other') return named(role);
    const used = new Set((['dorsal', 'ventral', 'head'] as const).map((r) => named(r)?.photoId));
    return photos.find((p) => !used.has(p.photoId)); // a second shot of a part, or an older untagged one
  };
  const nextSlot = (): Slot => SLOTS.find((x) => x.role !== 'other' && !slotOf(x.role))?.role ?? 'other';
  async function addPhoto(get: () => Promise<ShotResult | { error: string } | null>, role?: Slot) {
    setPhotoError(null);
    try {
      const shot = await get();
      if (!shot) return;
      if ('error' in shot) return setPhotoError(shot.error);
      const photoId = newId();
      savePhoto({ photoId, recordId: id, bytes: shot.bytes, widthPx: shot.width, heightPx: shot.height, takenAt: now(), role: role ?? nextSlot() });
      update((r) => ({ ...r, photoIds: [...r.photoIds, photoId] }));
    } catch (err) {
      setPhotoError(String(err));
    } finally {
      setMeta('pendingPhotoRole', '');
    }
  }
  const shoot = (role: Slot = nextSlot()) => {
    setMeta('pendingPhotoRole', role); // Android may close the app behind the camera; the slot survives that
    addPhoto(() => takePhoto(id), role);
  };

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
              <Button label="Pick species" kind="white" size={56} icon="search" lines={1} style={{ flex: 1, paddingHorizontal: 12 }} onPress={() => router.push({ pathname: '/species/[id]', params: { id } })} />
              <Button label="Scale key" kind="white" size={56} icon="key" lines={1} style={{ flex: 1, paddingHorizontal: 12 }} onPress={() => router.push({ pathname: '/key/[id]', params: { id } })} />
            </Pair>
            <Text style={[fs.label, { marginTop: 4, marginHorizontal: 4 }]}>ID basis</Text>
            <Chips
              options={ID_BASIS.map((b) => ({ code: b.code, label: b.label }))}
              value={e.taxon.idBasis === 'scale-key' ? undefined : e.taxon.idBasis}
              onChange={(v) => v && update((r) => ({ ...r, taxon: { ...r.taxon, idBasis: v as LocalEncounter['taxon']['idBasis'] } }))}
            />
          </View>
        );
      case 'photos': {
        const slot = (x: (typeof SLOTS)[number], big?: boolean) => {
          const p = slotOf(x.role);
          return (
            <View key={x.role} style={{ flex: big ? undefined : 1, gap: 4 }}>
              <Text style={st.slotLabel}>{x.label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={p ? `${x.label} photo` : `Take the ${x.label.toLowerCase()} photo`}
                disabled={!!p}
                onPress={() => shoot(x.role)}
                style={({ pressed }) => [big ? st.slotBig : st.slot, !p && st.slotEmpty, pressed && { backgroundColor: t.secPress }]}
              >
                {p ? <Image source={{ uri: photoUri(p.path) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="camera" size={big ? 32 : 26} color={t.ink2} strokeWidth={1.6} />}
              </Pressable>
            </View>
          );
        };
        return (
          <View style={{ gap: 10 }}>
            {slot(SLOTS[0]!, true)}
            <View style={{ flexDirection: 'row', gap: 8 }}>{SLOTS.slice(1).map((x) => slot(x))}</View>
            <Pair>
              <Button label="Take photo" size={48} icon="camera" lines={1} style={{ flex: 1 }} onPress={() => shoot()} />
              <Button label="From library" kind="outline" size={48} icon="image" lines={1} style={{ flex: 1 }} onPress={() => addPhoto(pickPhoto)} />
            </Pair>
            <Hint text={photoError} />
          </View>
        );
      }
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
    if (f.type === 'taxon' || f.type === 'photos') return <View key={f.key}>{sp}</View>;
    return <FieldInput key={f.key} field={f} value={getPath(e, f.path)} onChange={(v) => set(f.path, v)} nowIso={now} special={sp} />;
  };


  const fieldsOf = (key: SecKey): EffectiveField[] =>
    key === 'photos'
      ? byGroup(fields, ['animal']).filter((f) => f.type === 'photos')
      : key === 'animal'
        ? byGroup(fields, ['animal']).filter((f) => f.type !== 'photos')
        : byGroup(fields, [key]);

  const progressOf = (key: SecKey): { done: number; total: number } => {
    if (key === 'photos') return { done: Math.min(photos.length, PHOTO_TARGET), total: fieldsOf('photos').length ? PHOTO_TARGET : 0 };
    if (key === 'location') {
      const settled = !!e.location && (e.location.check.band === 'green' || !!e.location.check.decision || !!e.location.original);
      return { done: settled ? 1 : 0, total: fieldsOf('location').some((f) => f.type === 'location') ? 1 : 0 };
    }
    const list = fieldsOf(key);
    const done = list.filter((f) => (f.type === 'taxon' ? !!(e.taxon.scientificName || e.taxon.unidentified) : filled(getPath(e, f.path)))).length;
    return { done, total: list.length };
  };

  const shown = SECTIONS.filter((x) => progressOf(x.key).total > 0);
  const complete = shown.filter((x) => {
    const p = progressOf(x.key);
    return p.done >= p.total;
  }).length;

  const locationBody = () => {
    const list = fieldsOf('location');
    const loc = list.find((f) => f.type === 'location');
    const dist = list.find((f) => f.key === 'distanceAlongM');
    if (!loc) return null;
    return transect ? (
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
    );
  };

  const body = (key: SecKey) => {
    if (key === 'location') return locationBody();
    return (
      <View style={{ gap: 10 }}>
        {fieldsOf(key).map(renderField)}
        {key === 'measurements' &&
          rangeWarnings.map((w) => (
            <View key={w.fieldPath + w.message}>
              <Hint text={w.message} />
            </View>
          ))}
      </View>
    );
  };

  /** The open section, full width above the tiles, with Close (design pick 3C). */
  const openCard = (key: SecKey) => {
    const sec = SECTIONS.find((x) => x.key === key)!;
    const title = key === 'measurements' ? 'Measurements' : key === 'scales' ? 'Scale counts' : sec.label;
    return (
      <View key={`open-${key}`} style={key === 'location' ? null : [st.openCard, key === 'photos' && { backgroundColor: t.card }]}>
        <View style={st.openHead}>
          <T v="head" style={{ flex: 1 }}>
            {title}
          </T>
          <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={() => setOpen(null)} hitSlop={8} style={({ pressed }) => [st.close, key === 'photos' && { backgroundColor: t.group }, pressed && { backgroundColor: t.secPress }]}>
            <Text style={st.closeText}>Close</Text>
            <Icon name="chev-up" size={14} color={t.ink} strokeWidth={2.25} />
          </Pressable>
        </View>
        {body(key)}
      </View>
    );
  };

  const tile = (key: SecKey) => {
    const sec = SECTIONS.find((x) => x.key === key)!;
    const p = progressOf(key);
    const firstPhoto = key === 'photos' ? photos[0] : undefined;
    const locPoint =
      key === 'location' && e.location
        ? { lat: e.location.lat, lon: e.location.lon, band: e.location.check.decision?.kind === 'accepted-suggestion' || e.location.original ? ('green' as const) : e.location.check.band }
        : undefined;
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={`${sec.label}, ${p.done} of ${p.total} done. Open.`}
        onPress={() => {
          setOpen(key);
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        }}
        style={({ pressed }) => [st.tile, pressed && { backgroundColor: t.secPress }]}
      >
        <View style={st.tileArt}>
          {firstPhoto ? (
            <Image source={{ uri: photoUri(firstPhoto.path) }} style={st.tilePhoto} contentFit="cover" />
          ) : key === 'location' && transect ? (
            <TransectThumb transect={transect} size={80} width={146} point={locPoint} />
          ) : key === 'photos' ? (
            <View style={[st.tilePhoto, st.slotEmpty, { width: 96 }]}>
              <Icon name="camera" size={30} color={t.ink2} strokeWidth={1.5} />
            </View>
          ) : (
            <Icon name={sec.icon} size={60} color={t.ink} strokeWidth={1.15} />
          )}
        </View>
        <Text style={st.tileName}>{sec.label}</Text>
        <Ring done={p.done} total={p.total} />
      </Pressable>
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
      <ScrollView ref={scrollRef} contentContainerStyle={st.page} keyboardShouldPersistTaps="handled">
        <View style={st.progress} accessibilityLabel={`${complete} of ${shown.length} sections done${missing.length ? `. HQ still needs ${missing.join(', ')}` : ''}`}>
          <Text style={st.progressText}>
            {complete} of {shown.length} sections done
            {missing.length > 0 ? <Text style={{ color: t.ink2 }}>{` · HQ needs ${missing.join(', ')}`}</Text> : null}
          </Text>
          <View style={st.bar}>
            {shown.map((x) => {
              const p = progressOf(x.key);
              return <View key={x.key} style={[st.seg, { backgroundColor: p.done >= p.total ? t.onMark : t.track }]} />;
            })}
          </View>
        </View>
        {open && openCard(open)}
        <Group style={{ padding: 8 }}>
          <View style={st.grid}>{shown.filter((x) => x.key !== open).map((x) => tile(x.key))}</View>
        </Group>
        {e.status === 'void' && <T dim>This record is voided. It is kept, and HQ will see it as voided.</T>}
        <View style={st.info}>
          <Icon name="clock" size={15} color={t.ink2} />
          <Text style={st.infoText}>
            Seen {clockOf(e.observedAt)} · form v{e.coreVersion}
            {e.overlayRev ? ` + team change ${e.overlayRev}` : ''}
          </Text>
        </View>
      </ScrollView>
      <BottomBar>
        {!e.taxon.scientificName && !e.taxon.unidentified && !choicePending ? (
          <Pair>
            <Button label="Pick species" icon="search" size={56} lines={1} style={{ flex: 1.4 }} onPress={() => router.push({ pathname: '/species/[id]', params: { id } })} />
            <Button
              label="Done"
              kind="grey"
              size={56}
              style={{ flex: 1 }}
              onPress={() => {
                sealNow();
                router.back();
              }}
            />
          </Pair>
        ) : (
          <Button
            label="Done"
            kind={choicePending || complete < shown.length ? 'grey' : 'primary'}
            size={choicePending ? 56 : 64}
            onPress={() => {
              sealNow();
              router.back();
            }}
          />
        )}
      </BottomBar>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginHorizontal: 6 },
  infoText: { ...type.sub, color: t.ink2, flex: 1 },
  progress: { gap: 8, marginTop: 6, marginBottom: 12, marginHorizontal: 4 },
  progressText: { ...type.sub, color: t.ink },
  bar: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  openCard: { backgroundColor: t.group, borderRadius: radius.group, padding: 8, paddingTop: 6, gap: 6, marginBottom: 10 },
  openHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, minHeight: 48 },
  close: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: t.card },
  closeText: { ...type.small, fontWeight: '600', color: t.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  tile: { width: '48.8%', minHeight: 176, backgroundColor: t.card, borderRadius: radius.card, padding: 12, alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  tileArt: { height: 80, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  tilePhoto: { width: '100%', height: 80, borderRadius: 8, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  tileName: { ...type.title, fontWeight: '500', color: t.ink },
  slotLabel: { ...type.small, color: t.ink2, marginHorizontal: 2 },
  slotBig: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.card, overflow: 'hidden', backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' },
  slot: { width: '100%', aspectRatio: 1, borderRadius: radius.card, overflow: 'hidden', backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' },
  slotEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.ink2, backgroundColor: 'transparent' },
  spName: { fontSize: 22, fontWeight: '700', fontStyle: 'italic', letterSpacing: -0.2, lineHeight: 26, color: t.ink },
  spUnset: { fontStyle: 'normal', fontWeight: '600', color: t.ink2 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 12 },
  savedText: { ...type.sub, color: t.ink2 },
  venom: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.offTint, paddingVertical: 10, paddingHorizontal: 16 },
  venomText: { ...type.sub, color: t.offTintInk, flex: 1, fontWeight: '600' },
}));
