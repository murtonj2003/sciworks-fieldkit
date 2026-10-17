// No passwords for the demo: pick a name. Switching person never touches any record.
// Built from comp 2B's switch list (fidelity pass, Sat 17 Oct): ground › grey group with its quiet label inside ›
// white rows, a grey initials disc, the name in body type and the role under it, a tick on the person holding the
// phone now, grouped by team. Profile's Switch profile list uses the same disc and label.
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Group, T } from '@/components/ui';
import { ROLE_LABEL, useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 20 },
  lead: { ...type.small, fontWeight: '400', lineHeight: 18, color: t.ink2, marginTop: 8, marginHorizontal: 14, marginBottom: -6 },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 64 },
  name: { ...type.body, color: t.ink },
  sub: { ...type.sub, color: t.ink2 },
}));

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** A person's initials on a grey disc (comp 2B): transect grey, white letters by day, near-black at night. */
export function InitialsDisc({ name }: { name: string }) {
  const { t } = useTheme();
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.transect, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type.body, { color: t.onPri }]} maxFontSizeMultiplier={1.2}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/** The quiet second-ink label inside a grey group, above its white list (comp 2B "Switch profile"). */
export function TrayLabel({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  return <Text style={[type.sub, { color: t.ink2, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }]}>{children}</Text>;
}

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
          <Group key={team.teamId}>
            <TrayLabel>{team.name}</TrayLabel>
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
                        <InitialsDisc name={p.name} />
                        <View style={{ flex: 1, gap: 1 }}>
                          <Text style={s.name}>{p.name}</Text>
                          <Text style={s.sub}>{ROLE_LABEL[p.role]}</Text>
                        </View>
                        {on && <Icon name="check" size={22} color={t.ink} strokeWidth={2.25} />}
                      </Pressable>
                    </View>
                  );
                })}
            </View>
          </Group>
        ))}
      </ScrollView>
    </View>
  );
}

export default function PersonPicker() {
  return <ProfileList onChosen={() => router.back()} />;
}
