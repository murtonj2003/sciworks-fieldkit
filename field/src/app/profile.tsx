// Profile (design pick 2B): who is holding the phone, switch profile, hand over, the Team Lead's form settings,
// night mode and the storage check. Reached from the floating pill nav and the person pill on Home.
import { router } from 'expo-router';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { NAV_PILL_CLEARANCE, NavPill } from '@/components/NavPill';
import type { IconName } from '@/components/sprite';
import { Group, GroupTitle, T, Tag } from '@/components/ui';
import { listRecords } from '@/db/records';
import type { LocalSurvey } from '@/model/records';
import { ROLE_LABEL, useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: NAV_PILL_CLEARANCE },
  me: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 4, paddingVertical: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: t.group, alignItems: 'center', justifyContent: 'center' },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 54 },
  initials: { width: 30, height: 30, borderRadius: 15, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 30, height: 30, borderRadius: radius.tile, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title, color: t.ink },
  sub: { ...type.sub, color: t.ink2 },
}));

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export default function Profile() {
  const { project, person, choosePerson } = useField();
  const s = useStyles();
  const { t, setAppearance } = useTheme();
  if (!project || !person) return <T>Load a project and choose a person first.</T>;
  const team = project.teams.find((x) => x.teamId === person.teamId);
  const mates = project.people.filter((p) => p.teamId === person.teamId && p.personId !== person.personId);
  const current = listRecords<LocalSurvey>('survey').find((sv) => !sv.finishedAt && sv.status === 'active');

  const row = (icon: IconName, title: string, onPress: () => void, i: number, end?: React.ReactNode, sub?: string) => (
    <View key={title}>
      {i > 0 && <View style={s.sep} />}
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }]}>
        <View style={s.tile}>
          <Icon name={icon} size={18} color={t.ink} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.title, { flexShrink: 1 }]}>{title}</Text>
            {end}
          </View>
          {sub ? <Text style={s.sub}>{sub}</Text> : null}
        </View>
        <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
      </Pressable>
    </View>
  );

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.me}>
          <View style={s.avatar}>
            <Icon name="user" size={34} color={t.ink} strokeWidth={1.75} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="display" style={{ fontSize: 26 }}>
              {person.name}
            </T>
            <Text style={s.sub}>
              {ROLE_LABEL[person.role]} · {team?.name ?? person.teamId}
            </Text>
          </View>
        </View>

        {mates.length > 0 && (
          <>
            <GroupTitle>Switch profile</GroupTitle>
            <Group>
              <View style={s.list}>
                {mates.map((p, i) => (
                  <View key={p.personId}>
                    {i > 0 && <View style={s.sep} />}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Switch to ${p.name}, ${ROLE_LABEL[p.role]}`}
                      onPress={() => choosePerson(p.personId)}
                      style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }]}
                    >
                      <View style={s.initials}>
                        <Text style={[type.small, { fontWeight: '700', color: t.ink }]}>{initialsOf(p.name)}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={s.title}>{p.name}</Text>
                        <Text style={s.sub}>{ROLE_LABEL[p.role]}</Text>
                      </View>
                      <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </Group>
            <Pressable accessibilityRole="button" onPress={() => router.push('/person')} hitSlop={6} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginHorizontal: 14 }}>
              <Text style={[type.sub, { fontWeight: '500', color: t.ink, textDecorationLine: 'underline' }]}>Someone from another team</Text>
            </Pressable>
          </>
        )}

        <GroupTitle>This phone</GroupTitle>
        <Group>
          <View style={s.list}>
            {row('updown', 'Hand over to HQ', () => router.push('/handover'), 0)}
            {row(
              'sliders',
              'Form settings',
              () => router.push('/form-settings'),
              1,
              person.role === 'team-lead' ? <Tag label="Team Lead" /> : undefined,
              person.role === 'team-lead' ? 'Change the form offline' : undefined,
            )}
            {row('folder', 'Storage check', () => router.push('/storage'), 2)}
            <View style={s.sep} />
            <View style={s.row}>
              <View style={s.tile}>
                <Icon name="moon" size={18} color={t.ink} />
              </View>
              <Text style={[s.title, { flex: 1 }]}>Night mode</Text>
              <Switch
                accessibilityLabel="Night mode"
                value={t.name === 'night'}
                onValueChange={(v) => setAppearance(v ? 'night' : 'day')}
                trackColor={{ false: t.group, true: t.pri }}
                thumbColor="#FFFFFF"
              />
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
