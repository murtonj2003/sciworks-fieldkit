// No passwords for the demo: pick a name. Switching person never touches any record.
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, H2, P } from '@/components/ui';
import { ROLE_LABEL, useField } from '@/state/field';

export default function PersonPicker() {
  const { project, person, choosePerson } = useField();
  if (!project) return <P>Load a project first.</P>;
  const fieldTeams = project.teams.filter((t) => project.people.some((p) => p.teamId === t.teamId && (p.role === 'team-lead' || p.role === 'surveyor')));

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <P dim>Records you make are stamped with your name. Anyone can pick up the phone and switch.</P>
      {fieldTeams.map((team) => (
        <View key={team.teamId} style={styles.team}>
          <H2>{team.name}</H2>
          {project.people
            .filter((p) => p.teamId === team.teamId)
            .map((p) => (
              <Button
                key={p.personId}
                kind={p.personId === person?.personId ? 'primary' : 'secondary'}
                label={`${p.name} · ${ROLE_LABEL[p.role]}`}
                onPress={() => {
                  choosePerson(p.personId);
                  router.back();
                }}
              />
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  team: { gap: 10 },
});
