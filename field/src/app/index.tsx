// P1 · Home, rebuilt to comp 1D + 2B (fidelity pass, Sat 20:30): large title + Night switch, the person chip on its
// own line, the counter card with the way into Hand over to HQ inside it (scrolls away), the red / amber / green
// strip, Transects (60 × 48 satellite thumbs, a status dot, the chosen row ringed) with a bare preview map, one
// black Start / Continue survey, then Recent (Surveys · Animals). Floating black pill nav (2B). The project line
// and "Project loaded" now live on Profile. No project yet: Set up this phone.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CounterBar } from '@/components/CounterBar';
import { NAV_PILL_CLEARANCE, NavPill } from '@/components/NavPill';
import { TransectMap, TransectThumb } from '@/components/TransectMap';
import { TierDot, TierTag, UploadStrip } from '@/components/UploadStatus';
import { tierCounts, uploadTier } from '@/db/status';
import { BandMarker, Icon } from '@/components/Icon';
import type { IconName } from '@/components/sprite';
import { BottomBar, Button, Group, Row, T } from '@/components/ui';
import { createFreshDraft, listRecords } from '@/db/records';
import { bootInfo, launch } from '@/lib/boot';
import { ProfileList } from './person';
import { DEMO_BUNDLE_NAME, demoHqBundleBytes } from '@/lib/demoBundle';
import { clockOf } from '@/lib/time';
import { newEncounter } from '@/model/factory';
import { effectiveFields, withDefaults } from '@/model/form';
import { missingForHq, type LocalEncounter, type LocalSurvey } from '@/model/records';
import { isNight } from '@/model/survey';
import { useField } from '@/state/field';
import { pendingCount } from '@/sync/corrections';
import { receiveHqBundle, type ReceiveResult } from '@/sync/receiveHq';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-16' → '16 Oct'. */
const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1] ?? ''}`;
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  appbar: { paddingHorizontal: 20, paddingBottom: 8, backgroundColor: t.ground },
  appRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8, color: t.ink },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.group, marginTop: 4 },
  chipText: { ...type.sub, color: t.ink },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  page: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  h2: { marginHorizontal: 4, marginTop: 10, marginBottom: -4 },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 50 },
  tile: { width: 30, height: 30, borderRadius: radius.tile, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  tileDark: { backgroundColor: t.pri },
  rowTitle: { ...type.body, color: t.ink, flex: 1 },
  sub: { ...type.sub, color: t.ink2, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 2 },
  trow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, paddingRight: 14, borderRadius: radius.card, backgroundColor: t.card, borderWidth: 2, borderColor: 'transparent' },
  trowOn: { borderColor: t.ink },
  trTitle: { ...type.title, fontSize: 16, fontWeight: '500', color: t.ink },
}));

export default function Home() {
  const field = useField();
  const { project, template, person, pack, overlay, transects } = field;
  const s = useStyles();
  const { t, setAppearance } = useTheme();
  const insets = useSafeAreaInsets();
  const [profileChosen, setProfileChosen] = useState(launch.profileChosen);
  const [received, setReceived] = useState<ReceiveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovered] = useState(() => {
    if (bootInfo.shown) return 0;
    bootInfo.shown = true;
    return bootInfo.recoveredDrafts;
  });

  async function loadDemo() {
    setBusy(true);
    try {
      const bytes = await demoHqBundleBytes();
      setReceived(receiveHqBundle(bytes, DEMO_BUNDLE_NAME));
      field.refresh();
    } catch (e) {
      setReceived({ ok: false, changes: [], warnings: [], error: String(e) });
    } finally {
      setBusy(false);
    }
  }

  const surveys = person ? listRecords<LocalSurvey>('survey').sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : [];
  const encounters = person ? listRecords<LocalEncounter>('encounter') : [];
  const current = surveys.find((sv) => !sv.finishedAt && sv.status === 'active');
  const animalsOf = (sv: LocalSurvey) => encounters.filter((e) => e.surveyId === sv.id && e.status === 'active');
  const incompleteOf = (sv: LocalSurvey) => missingForHq(sv).length + animalsOf(sv).filter((e) => missingForHq(e).length > 0).length;
  const corrections = person ? pendingCount() : 0;
  const nightNow = t.name === 'night';
  const team = project?.teams.find((x) => x.teamId === person?.teamId);
  const ownTransect = (id: string) => !team || team.transectIds.includes(id);
  // All the project's transects, this team's first (comp 1D shows a list; other teams' rows say whose they are).
  const teamTransects = [...(transects?.features ?? [])].sort((a, b) => Number(!ownTransect(a.properties.transectId)) - Number(!ownTransect(b.properties.transectId)));
  const teamOf = (id: string) => project?.teams.find((x) => x.transectIds.includes(id));
  const [picked, setPicked] = useState<string | null>(null);
  const chosenId = picked ?? current?.transectId ?? teamTransects[0]?.properties.transectId ?? null;
  const chosen = teamTransects.find((f) => f.properties.transectId === chosenId) ?? null;
  const lastWalked = (transectId: string) => surveys.find((sv) => sv.transectId === transectId)?.date;
  const counts = person ? tierCounts() : { phone: 0, sent: 0, hq: 0 };
  const recentAnimals = useMemo(
    () => [...encounters].filter((e) => e.status === 'active').sort((a, b) => b.observedAt.localeCompare(a.observedAt)).slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [field.counter],
  );
  const chosenPoints = chosen && current && current.transectId === chosenId
    ? animalsOf(current).flatMap((e) =>
        e.location
          ? [{ lat: e.location.lat, lon: e.location.lon, band: e.location.check.decision?.kind === 'accepted-suggestion' || e.location.original ? ('green' as const) : e.location.check.band }]
          : [],
      )
    : [];
  const openSurvey = () =>
    current ? router.push({ pathname: '/survey/[id]', params: { id: current.id } }) : router.push({ pathname: '/survey/new', params: chosenId ? { transectId: chosenId } : {} });

  function addAnimal() {
    if (!project || !template || !person || !current) return;
    const ctx = { project, template, person, deviceId: field.deviceId, overlayRev: overlay?.overlayRev ?? 0 };
    const e = withDefaults(newEncounter(ctx, current), effectiveFields(template, overlay, 'encounter'));
    createFreshDraft(e); // counted only once something is entered
    router.push({ pathname: '/encounter/[id]', params: { id: e.id } });
  }

  const actionRow = (icon: IconName, label: string, onPress: () => void, end?: React.ReactNode, i = 1, sub?: string) => (
    <View key={label}>
      {i > 0 && <View style={s.sep} />}
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.row, sub && { minHeight: 62 }, pressed && { backgroundColor: t.secPress }]}>
        <View style={s.tile}>
          <Icon name={icon} size={18} color={t.ink} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={[s.rowTitle, { flex: 1 }]}>{label}</Text>
            {end}
          </View>
          {sub ? <Text style={[type.sub, { color: t.ink2 }]}>{sub}</Text> : null}
        </View>
        <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
      </Pressable>
    </View>
  );

  // Launch gate: once a project is on the phone, "Select your profile" opens before the dashboard.
  if (project && !profileChosen) {
    return (
      <View style={s.wrap}>
        <View style={[s.appbar, { paddingTop: insets.top + 6 }]}>
          <T v="display">Select your profile</T>
        </View>
        <ProfileList
          onChosen={() => {
            launch.profileChosen = true;
            setProfileChosen(true);
          }}
        />
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={[s.page, project && person ? { paddingBottom: NAV_PILL_CLEARANCE } : null]} keyboardShouldPersistTaps="handled">
        <View style={[s.appbar, { paddingTop: insets.top + 6, marginHorizontal: -16 }]}>
          <View style={s.appRow}>
            <Text style={s.title} accessibilityRole="header">
              Fieldkit
            </Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Night"
              accessibilityState={{ checked: nightNow }}
              onPress={() => setAppearance(nightNow ? 'day' : 'night')}
              onLongPress={() => setAppearance('auto')}
              style={s.iconBtn}
            >
              <Icon name={nightNow ? 'sun' : 'moon'} size={24} color={t.ink} strokeWidth={1.75} />
            </Pressable>
          </View>
          {person && (
            <Pressable accessibilityRole="button" accessibilityLabel={`${person.name}, ${team?.name ?? ''}. Opens Profile.`} onPress={() => router.push('/profile')} style={({ pressed }) => [s.chip, pressed && { backgroundColor: t.greyPress }]}>
              <Icon name="users" size={18} color={t.ink} strokeWidth={1.6} />
              <Text style={s.chipText}>
                {person.name} · {team?.name ?? person.teamId}
              </Text>
            </Pressable>
          )}
        </View>

        {project && person && <CounterBar handover onPress={() => router.push('/handover')} />}
        {project && person && <UploadStrip counts={counts} />}

        {recovered > 0 && (
          <Group>
            <Row style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: t.onFill, paddingTop: 11, paddingBottom: 12 }}>
              <BandMarker band="green" size={20} />
              <T v="sub" color={t.onInk} style={{ flex: 1 }}>
                Recovered {recovered} {recovered === 1 ? 'record that was' : 'records that were'} still being typed when the app closed. Nothing was lost.
              </T>
            </Row>
          </Group>
        )}

        {!project && (
          <Group>
            <Row style={{ gap: 6 }}>
              <T v="head">Set up this phone</T>
              <T v="sub" dim>
                Load the project your Data Manager prepared. The demo project is built into the app, so this works offline.
              </T>
            </Row>
            <Button label="Receive a project from HQ (file)" kind="white" size={56} icon="download" onPress={() => router.push('/handover')} />
          </Group>
        )}

        {received && !received.ok && (
          <Group>
            <Row style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="warning" size={18} color={t.ink} strokeWidth={2} />
                <T v="title">Not loaded</T>
              </View>
              {received.error && <T v="sub">{received.error}</T>}
              {received.warnings.map((w) => (
                <T key={w} v="sub" color={t.nearInk}>
                  {w}
                </T>
              ))}
            </Row>
          </Group>
        )}

        {project && !person && (
          <Group>
            <Row style={{ gap: 4 }}>
              <T v="title">Who is using this phone?</T>
              <T v="sub" dim>
                Records you make are stamped with your name.
              </T>
            </Row>
            <Button label="Choose who is using this phone" kind="white" size={56} icon="user" onPress={() => router.push('/person')} />
          </Group>
        )}

        {corrections > 0 && (
          <Group>
            <View style={s.list}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/inbox')} style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }]}>
                <View style={[s.tile, s.tileDark]}>
                  <Icon name="inbox" size={18} color={t.onPri} />
                </View>
                <Text style={s.rowTitle}>
                  {corrections} {corrections === 1 ? 'correction' : 'corrections'} from HQ to answer
                </Text>
                <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
              </Pressable>
            </View>
          </Group>
        )}

        {person && teamTransects.length > 0 && (
          <>
            <T v="head" style={s.h2}>
              Transects
            </T>
            <Group style={{ gap: 6 }}>
              {teamTransects.map((f) => {
                const id = f.properties.transectId;
                const on = id === chosenId;
                const walked = lastWalked(id);
                const latest = surveys.find((sv) => sv.transectId === id);
                const live = current?.transectId === id ? current : null;
                const other = !ownTransect(id) ? teamOf(id)?.name : undefined;
                const sub = live
                  ? `In progress · ${clockOf(live.startedAt)} · ${animalsOf(live).length} ${animalsOf(live).length === 1 ? 'animal' : 'animals'}`
                  : other && !walked
                    ? `${other} · ${thousands(f.properties.lengthM)} m`
                    : `${other ? `${other} · ` : ''}${thousands(f.properties.lengthM)} m · ${walked ? `last walked ${shortDate(walked)}` : 'not walked yet'}`;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${f.properties.name}. ${sub}`}
                    onPress={() => setPicked(id)}
                    style={({ pressed }) => [s.trow, on && s.trowOn, pressed && { backgroundColor: t.secPress }]}
                  >
                    <TransectThumb transect={f} size={48} width={60} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.trTitle} numberOfLines={1}>
                        {f.properties.name.replace(/\s*\(.*\)\s*$/, '')}
                      </Text>
                      <T v="sub" dim numberOfLines={1}>
                        {sub}
                      </T>
                    </View>
                    <TierDot tier={latest ? uploadTier(latest.id) : null} />
                  </Pressable>
                );
              })}
              {chosen && <TransectMap transect={chosen} points={chosenPoints} height={148} bare showSwitch={false} />}
            </Group>
            {chosen && (
              <Button
                label={current ? `Continue survey on ${current.transectId}` : 'Start survey'}
                size={56}
                onPress={current ? () => router.push({ pathname: '/survey/[id]', params: { id: current.id } }) : openSurvey}
              />
            )}
          </>
        )}

        {person && (surveys.length > 0 || recentAnimals.length > 0) && (
          <>
            <T v="head" style={s.h2}>
              Recent
            </T>
            <Group style={{ gap: 6 }}>
              {surveys.length > 0 && <Text style={s.sub}>Surveys</Text>}
              {surveys.length > 0 && (
                <View style={s.list}>
                  {surveys.slice(0, 4).map((sv, i) => {
                    const n = animalsOf(sv).length;
                    const k = incompleteOf(sv);
                    return (
                      <View key={sv.id}>
                        {i > 0 && <View style={s.sep} />}
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => router.push({ pathname: '/survey/[id]', params: { id: sv.id } })}
                          style={({ pressed }) => [s.row, { minHeight: 62 }, pressed && { backgroundColor: t.secPress }]}
                        >
                          <Icon name={isNight(sv) ? 'moon' : 'survey'} size={26} color={t.ink} strokeWidth={1.5} />
                          <View style={{ flex: 1, gap: 2 }}>
                            <T v="body">
                              {sv.transectId} · {shortDate(sv.date)}
                            </T>
                            <T v="sub" dim numberOfLines={1}>
                              {clockOf(sv.startedAt)}
                              {sv.finishedAt ? `–${clockOf(sv.finishedAt)}` : ' on'} · {n} {n === 1 ? 'animal' : 'animals'}
                              {k > 0 ? ` · ${k} to fill in` : ''}
                            </T>
                          </View>
                          <TierTag tier={uploadTier(sv.id)} />
                          <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
              {recentAnimals.length > 0 && <Text style={s.sub}>Animals</Text>}
              {recentAnimals.length > 0 && (
                <View style={s.list}>
                  {recentAnimals.map((a, i) => (
                    <View key={a.id}>
                      {i > 0 && <View style={s.sep} />}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push({ pathname: '/encounter/[id]', params: { id: a.id } })}
                        style={({ pressed }) => [s.row, { minHeight: 62 }, pressed && { backgroundColor: t.secPress }]}
                      >
                        <Icon name="snake-coil" size={26} color={t.ink} strokeWidth={1.5} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <T v="body" italic={!!a.taxon.scientificName} dim={!a.taxon.scientificName}>
                            {a.taxon.scientificName ?? (a.taxon.unidentified ? 'Unidentified' : 'Not chosen yet')}
                          </T>
                          <T v="sub" dim>
                            {a.transectId} · {clockOf(a.observedAt)}
                          </T>
                        </View>
                        <TierTag tier={uploadTier(a.id)} />
                        <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </Group>
          </>
        )}
        {!project && (
          <Group>
            <View style={s.list}>{actionRow('folder', 'Storage check', () => router.push('/storage'), undefined, 0)}</View>
          </Group>
        )}
      </ScrollView>

      {!project && (
        <BottomBar>
          <Button label={busy ? 'Loading…' : 'Load demo project'} size={64} onPress={loadDemo} disabled={busy} />
        </BottomBar>
      )}
      {project && person && <NavPill active="survey" onSurvey={openSurvey} onAdd={current ? addAnimal : openSurvey} onProfile={() => router.push('/profile')} />}
    </View>
  );
}
