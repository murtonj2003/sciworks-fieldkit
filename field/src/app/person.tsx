// No passwords for the demo: pick a name. Switching person never touches any record.
// No comp for this screen: built from the kit's list pattern (ground › grey group › white rows, a 30 px tile,
// title + sub, a tick on the person holding the phone now), grouped by team.
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Group, GroupTitle, T } from '@/components/ui';
import { ROLE_LABEL, useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 },
  lead: { ...type.small, fontWeight: '400', lineHeight: 18, color: t.ink2, marginTop: 8, marginHorizontal: 14, marginBottom: 2 },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 54 },
  tile: { width: 30, height: 30, borderRadius: radius.tile, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title, color: t.ink },
  sub: { ...type.sub, color: t.ink2 },
}));

/** The profile list, grouped by team. Used as the launch gate (Home) and the Switch person screen. */
export function ProfileList({ onChosen }: { onChosen: () => void }) {
  const { project, person, choosePerson } = useField();
  const s = useStyles();
  const { t } = useTheme();
  if (!project) return <T>Load a project first.</T>;
  const fieldTeams = project.teams.filter((tm) => project.people.some((p) => p.teamId === tm.teamId && (p.role === 'team-lead' || p.role === 'surveyor')));

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={s.lead}>Records you make are stamped with your name. Anyone can pick up the phone and switch.</Text>
        {fieldTeams.map((team) => (
          <View key={team.teamId}>
            <GroupTitle>{team.name}</GroupTitle>
            <Group>
              <View style={s.list}>
                {project.people
                  .filter((p) => p.teamId === team.teamId)
                  .map((p, i) => {
                    const on = p.personId === person?.personId;
                    return (
                      <View key={p.personId}>
                        {i > 0 && <View style={s.sep} />}
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={`${p.name}, ${ROLE_LABEL[p.role]}`}
                          onPress={() => {
                            choosePerson(p.personId);
                            onChosen();
                          }}
                          style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }]}
                        >
                          <View style={[s.tile, on && { backgroundColor: t.pri }]}>
                            <Icon name="user" size={18} color={on ? t.onPri : t.ink} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.title}>{p.name}</Text>
                            <Text style={s.sub}>{ROLE_LABEL[p.role]}</Text>
                          </View>
                          {on && <Icon name="check" size={22} color={t.ink} strokeWidth={2.25} />}
                        </Pressable>
                      </View>
                    );
                  })}
              </View>
            </Group>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default function PersonPicker() {
  return <ProfileList onChosen={() => router.back()} />;
}
