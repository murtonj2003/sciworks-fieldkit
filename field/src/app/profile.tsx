// Profile (comps 2B right phone + S1 first screen; fidelity pass Sat 17 Oct): who is holding the phone, Switch
// profile (team mates, then someone from another team), Hand over to HQ, This phone (the storage ring, which opens
// Storage check), Night mode and Form settings each in their own card, and a quiet About this phone block with the
// project line Home no longer shows. No top bar (2B); a lone back chevron in the safe area is the way home.
import { Stack, router } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { NAV_PILL_CLEARANCE, NavPill } from '@/components/NavPill';
import { NeverDeletes, StorageRing } from '@/components/StorageRing';
import type { IconName } from '@/components/sprite';
import { Group, T, Tag, TrayTitle } from '@/components/ui';
import { listRecords } from '@/db/records';
import type { LocalSurvey } from '@/model/records';
import { ROLE_LABEL, useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

import { InitialsDisc, TrayLabel } from './person';

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingBottom: NAV_PILL_CLEARANCE, gap: 20 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: t.group, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 24, lineHeight: 29, fontWeight: '600', letterSpacing: -0.3, color: t.ink },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12 },
  lead: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  disc: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 64 },
  label: { ...type.body, color: t.ink },
  sub: { ...type.sub, color: t.ink2 },
  about: { backgroundColor: t.card, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, gap: 3 },
  quiet: { ...type.small, fontWeight: '400', color: t.ink2 },
}));

export default function Profile() {
  const { project, template, overlay, pack, person, choosePerson } = useField();
  const s = useStyles();
  const { t, setAppearance } = useTheme();
  const insets = useSafeAreaInsets();
  if (!project || !person) return <T>Load a project and choose a person first.</T>;
  const team = project.teams.find((x) => x.teamId === person.teamId);
  const mates = project.people.filter((p) => p.teamId === person.teamId && p.personId !== person.personId);
  const current = listRecords<LocalSurvey>('survey').find((sv) => !sv.finishedAt && sv.status === 'active');
  const lead = person.role === 'team-lead';
  const night = t.name === 'night';

  /** One tappable row: a 28 px line icon (or a disc) in a 40 px slot so every label lines up with the names. */
  const row = (start: ReactNode, label: string, onPress: () => void, opts: { tag?: ReactNode; sub?: string; a11y?: string } = {}) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={opts.a11y}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }]}
    >
      {start}
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[s.label, { flexShrink: 1 }]}>{label}</Text>
          {opts.tag}
        </View>
        {opts.sub ? <Text style={s.sub}>{opts.sub}</Text> : null}
      </View>
      <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
    </Pressable>
  );
  const icon = (name: IconName) => (
    <View style={s.lead}>
      <Icon name={name} size={28} color={t.ink} strokeWidth={1.6} />
    </View>
  );

  return (
    <View style={s.wrap}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={[s.page, { paddingTop: insets.top + 4 }]}>
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={4}
            style={({ pressed }) => [s.back, pressed && { backgroundColor: t.secPress }]}
          >
            <Icon name="back" size={24} color={t.ink} strokeWidth={2} />
          </Pressable>
          <View style={s.me}>
            <View style={s.avatar}>
              <Icon name="user" size={56} color={t.ink} strokeWidth={1.2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name} accessibilityRole="header">
                {person.name}
              </Text>
              <Text style={s.sub}>
                {ROLE_LABEL[person.role]} · {team?.name ?? person.teamId}
              </Text>
            </View>
          </View>
        </View>

        <Group>
          <TrayLabel>Switch profile</TrayLabel>
          <View style={s.list}>
            {mates.map((p) => (
              <View key={p.personId}>
                {row(<InitialsDisc name={p.name} />, p.name, () => choosePerson(p.personId), {
                  sub: ROLE_LABEL[p.role],
                  a11y: `Switch to ${p.name}, ${ROLE_LABEL[p.role]}`,
                })}
                <View style={s.sep} />
              </View>
            ))}
            {row(
              <View style={s.disc}>
                <Icon name="users" size={22} color={t.ink} strokeWidth={1.6} />
              </View>,
              'Someone from another team',
              () => router.push('/person'),
            )}
          </View>
        </Group>

        <Group>
          <View style={s.list}>{row(
              <View style={s.lead}>
                <Icon name="building" size={28} color={t.ink} strokeWidth={1.6} />
              </View>,
              'Hand over to HQ',
              () => router.push('/handover'),
            )}</View>
        </Group>

        <Group>
          <TrayTitle>This phone</TrayTitle>
          <StorageRing onPress={() => router.push('/storage')} />
          <NeverDeletes />
        </Group>

        <Group>
          <View style={[s.list, s.row]}>
            {icon('moon')}
            <Text style={[s.label, { flex: 1 }]}>Night mode</Text>
            <Switch
              accessibilityLabel="Night mode"
              value={night}
              onValueChange={(v) => setAppearance(v ? 'night' : 'day')}
              trackColor={{ false: t.greyPress, true: t.pri }}
              ios_backgroundColor={t.greyPress}
              thumbColor={night ? t.ink : '#FFFFFF'}
              // react-native-web paints the "on" thumb teal unless told otherwise.
              {...{ activeThumbColor: night ? t.ink : '#FFFFFF' }}
              // …and draws a small Material toggle; lift it to the iOS size the comp shows. Native is untouched.
              style={Platform.OS === 'web' ? { transform: [{ scale: 1.3 }], marginRight: 4 } : undefined}
            />
          </View>
        </Group>

        <Group>
          <View style={s.list}>
            {row(icon('sliders'), 'Form settings', () => router.push('/form-settings'), {
              tag: lead ? <Tag label="Team Lead" /> : undefined,
              sub: lead ? 'Change the form offline' : undefined,
            })}
          </View>
        </Group>

        <Group>
          <TrayLabel>About this phone</TrayLabel>
          <View style={s.about}>
            <T v="label">{project.name}</T>
            <Text style={s.quiet}>
              Form {template?.templateId} v{template?.coreVersion}
              {overlay ? ` · team change ${overlay.overlayRev}` : ''}
            </Text>
            <Text style={s.quiet}>{pack?.taxa.length ?? 0} species in the pack</Text>
            {pack && <Text style={s.quiet}>{pack.disclaimer.split('.')[0]}.</Text>}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Icon name="plane" size={14} color={t.ink2} />
              <Text style={s.quiet}>Works offline · saved on this phone</Text>
            </View>
          </View>
        </Group>
      </ScrollView>
      <NavPill
        active="profile"
        onSurvey={() => (current ? router.push({ pathname: '/survey/[id]', params: { id: current.id } }) : router.push('/survey/new'))}
        onAdd={() => (current ? router.push({ pathname: '/survey/[id]', params: { id: current.id } }) : router.push('/survey/new'))}
        onProfile={() => {}}
      />
    </View>
  );
}
