// P1 · Home. Large title + person pill + Night switch; the counter (sticky, first); recovered drafts; the survey in
// progress; corrections; actions; surveys; the project line last. Bottom bar: Add animal (survey running) or
// Start a survey. No project yet: Set up this phone.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CounterBar } from '@/components/CounterBar';
import { BandMarker, Icon } from '@/components/Icon';
import type { IconName } from '@/components/sprite';
import { BottomBar, Button, Group, GroupTitle, Row, T, Tag } from '@/components/ui';
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

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  appbar: { paddingHorizontal: 20, paddingBottom: 12, backgroundColor: t.ground },
  appRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingLeft: 8, paddingRight: 10, borderRadius: radius.pill, backgroundColor: t.group, flexShrink: 1 },
  pillText: { ...type.small, fontWeight: '600', color: t.ink },
  line: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  page: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  sticky: { backgroundColor: t.ground, paddingBottom: 0 },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 54 },
  sepPlain: { height: 1, backgroundColor: t.hair, marginLeft: 14 },
  tile: { width: 30, height: 30, borderRadius: radius.tile, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  tileDark: { backgroundColor: t.pri },
  rowTitle: { ...type.body, color: t.ink, flex: 1 },
  current: { paddingVertical: 12, paddingHorizontal: 14, gap: 3 },
  curTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));

export default function Home() {
  const field = useField();
  const { project, template, person, pack, overlay } = field;
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

  const team = project?.teams.find((x) => x.teamId === person?.teamId);
  const surveys = person ? listRecords<LocalSurvey>('survey').sort((a, b) => b.startedAt.localeCompare(a.startedAt)) : [];
  const encounters = person ? listRecords<LocalEncounter>('encounter') : [];
  const current = surveys.find((sv) => !sv.finishedAt && sv.status === 'active');
  const animalsOf = (sv: LocalSurvey) => encounters.filter((e) => e.surveyId === sv.id && e.status === 'active');
  const incompleteOf = (sv: LocalSurvey) => missingForHq(sv).length + animalsOf(sv).filter((e) => missingForHq(e).length > 0).length;
  const corrections = person ? pendingCount() : 0;
  const nightNow = t.name === 'night';

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
      <View style={[s.appbar, { paddingTop: insets.top + 6 }]}>
        <View style={s.appRow}>
          <T v="display">Fieldkit</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
            {person && (
              <Pressable accessibilityRole="button" accessibilityLabel={`${person.name}, ${team?.name ?? ''}. Switch person.`} onPress={() => router.push('/person')} hitSlop={{ top: 9, bottom: 9 }} style={s.pill}>
                <Icon name="user" size={15} color={t.ink2} />
                <Text style={s.pillText} numberOfLines={1}>
                  {person.name} · {team?.name ?? person.teamId}
                </Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Night"
              accessibilityState={{ checked: nightNow }}
              onPress={() => setAppearance(nightNow ? 'day' : 'night')}
              onLongPress={() => setAppearance('auto')}
              style={s.iconBtn}
            >
              <Icon name={nightNow ? 'sun' : 'moon'} size={22} color={t.ink} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
        <View style={s.line}>
          <Icon name="plane" size={15} color={t.ink2} />
          <T v="sub" dim>
            Works offline · saved on this phone
          </T>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.page} stickyHeaderIndices={project ? [0] : undefined} keyboardShouldPersistTaps="handled">
        {project ? (
          <View style={s.sticky}>
            <CounterBar onPress={() => router.push('/handover')} />
          </View>
        ) : null}

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

        {received && (
          <Group>
            <Row style={{ gap: 6 }}>
              <T v="title">{received.ok ? 'What changed' : 'Not loaded'}</T>
              {received.error && <T v="sub">{received.error}</T>}
              {received.changes.map((c) => (
                <View key={c} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="check" size={16} color={t.onMark} strokeWidth={2.25} />
                  <T v="sub" style={{ flex: 1 }}>
                    {c}
                  </T>
                </View>
              ))}
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

        {current && (
          <Group>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/survey/[id]', params: { id: current.id } })}
              style={({ pressed }) => [s.list, s.current, pressed && { backgroundColor: t.secPress }]}
            >
              <View style={s.curTitle}>
                <Icon name={isNight(current) ? 'moon' : 'sun'} size={20} color={t.ink2} />
                <T v="head" style={{ flex: 1 }}>
                  {current.transectId} · {isNight(current) ? 'Night survey' : 'Day survey'}
                </T>
                <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
              </View>
              <T v="sub" dim>
                Started {clockOf(current.startedAt)} · {animalsOf(current).length} {animalsOf(current).length === 1 ? 'animal' : 'animals'}
                {incompleteOf(current) > 0 ? ` · ${incompleteOf(current)} incomplete` : ''}
              </T>
            </Pressable>
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

        {project && (
          <Group>
            <View style={s.list}>
              {actionRow('updown', 'Hand over to HQ', () => router.push('/handover'), undefined, 0)}
              {person &&
                actionRow(
                  'sliders',
                  'Form settings',
                  () => router.push('/form-settings'),
                  person.role === 'team-lead' ? <Tag label="Team Lead" /> : undefined,
                  1,
                  person.role === 'team-lead' ? 'Change the form offline' : undefined,
                )}
              {actionRow('users', 'Switch person', () => router.push('/person'))}
              {actionRow('folder', 'Storage check', () => router.push('/storage'))}
            </View>
          </Group>
        )}
        {!project && (
          <Group>
            <View style={s.list}>{actionRow('folder', 'Storage check', () => router.push('/storage'), undefined, 0)}</View>
          </Group>
        )}

        {person && surveys.length > 0 && (
          <>
            <GroupTitle>Surveys on this phone</GroupTitle>
            <Group>
              <View style={s.list}>
                {surveys.map((sv, i) => {
                  const n = animalsOf(sv).length;
                  const k = incompleteOf(sv);
                  return (
                    <View key={sv.id}>
                      {i > 0 && <View style={s.sepPlain} />}
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push({ pathname: '/survey/[id]', params: { id: sv.id } })}
                        style={({ pressed }) => [s.row, { paddingHorizontal: 14, minHeight: 62 }, pressed && { backgroundColor: t.secPress }]}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <T v="body">
                            {sv.transectId} · {shortDate(sv.date)} · {clockOf(sv.startedAt)}
                            {sv.finishedAt ? `–${clockOf(sv.finishedAt)}` : ' · in progress'}
                          </T>
                          <T v="sub" dim>
                            {n} {n === 1 ? 'animal' : 'animals'}
                            {k > 0 ? ` · ${k} incomplete` : ''}
                          </T>
                        </View>
                        <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </Group>
          </>
        )}
        {person && surveys.length === 0 && (
          <T v="sub" dim style={{ marginHorizontal: 4 }}>
            No surveys on this phone yet.
          </T>
        )}

        {project && (
          <View style={{ marginTop: 16, marginHorizontal: 14, gap: 3 }}>
            <T v="label">{project.name}</T>
            <T v="small" dim style={{ fontWeight: '400' }}>
              Form {template?.templateId} v{template?.coreVersion}
              {overlay ? ` · team change ${overlay.overlayRev}` : ''} · {pack?.taxa.length ?? 0} species in the pack
            </T>
            {pack && (
              <T v="small" dim style={{ fontWeight: '400' }}>
                {pack.disclaimer.split('.')[0]}.
              </T>
            )}
          </View>
        )}
      </ScrollView>

      <BottomBar>
        {!project && <Button label={busy ? 'Loading…' : 'Load demo project'} size={64} onPress={loadDemo} disabled={busy} />}
        {project && person && current && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add animal"
              onPress={addAnimal}
              style={({ pressed }) => ({
                height: 72,
                borderRadius: radius.pill,
                backgroundColor: pressed ? t.priPress : t.pri,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingLeft: 28,
                paddingRight: 8,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <Text style={[type.title, { fontSize: 20, color: t.onPri }]}>Add animal</Text>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.onPri, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={26} color={t.pri} strokeWidth={2.25} />
              </View>
            </Pressable>
            <Button label="Open survey" kind="grey" size={56} onPress={() => router.push({ pathname: '/survey/[id]', params: { id: current.id } })} />
          </>
        )}
        {project && person && !current && <Button label="Start a survey" size={64} onPress={() => router.push('/survey/new')} />}
      </BottomBar>
    </View>
  );
}
