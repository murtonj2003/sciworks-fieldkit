// Start a survey: pick the transect and who is walking it, then Start (the time is taken automatically).
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chips, FieldLabel } from '@/components/fields';
import { Button, P } from '@/components/ui';
import { saveDraftNow, seal } from '@/db/records';
import { effectiveFields, withDefaults } from '@/model/form';
import { newSurvey } from '@/model/factory';
import { astroAtStart } from '@/model/survey';
import { useField } from '@/state/field';

export default function NewSurvey() {
  const field = useField();
  const { project, template, person, transects, overlay } = field;
  const team = project?.teams.find((t) => t.teamId === person?.teamId);
  const teamTransects = (transects?.features ?? []).filter((f) => team?.transectIds.includes(f.properties.transectId));
  const [transectId, setTransectId] = useState<string | undefined>(teamTransects[0]?.properties.transectId);
  const [surveyors, setSurveyors] = useState<string[]>(person ? [person.personId] : []);

  if (!project || !template || !person) return <P>Load a project and choose a person first.</P>;
  const fields = effectiveFields(template, overlay, 'survey');
  const label = (key: string) => fields.find((f) => f.key === key);
  const teamPeople = project.people.filter((p) => p.teamId === person.teamId);

  function start() {
    if (!project || !template || !person || !transectId) return;
    const ctx = { project, template, person, deviceId: field.deviceId, overlayRev: overlay?.overlayRev ?? 0 };
    let sv = withDefaults(newSurvey(ctx, transectId, surveyors.length ? surveyors : [person.personId]), fields);
    const transect = transects?.features.find((f) => f.properties.transectId === transectId);
    const astro = astroAtStart(sv.startedAt, transect);
    if (astro) sv = { ...sv, astro };
    saveDraftNow(sv);
    seal(sv.id);
    field.refresh();
    router.replace({ pathname: '/survey/[id]', params: { id: sv.id } });
  }

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.page}>
        {label('transectId') && <FieldLabel field={label('transectId')!} />}
        <Chips
          options={teamTransects.map((f) => ({ code: f.properties.transectId, label: f.properties.transectId }))}
          value={transectId}
          onChange={(v) => setTransectId(v as string | undefined)}
        />
        {transectId && (
          <P dim>
            {teamTransects.find((f) => f.properties.transectId === transectId)?.properties.name} ·{' '}
            {Math.round(teamTransects.find((f) => f.properties.transectId === transectId)?.properties.lengthM ?? 0)} m
          </P>
        )}
        {label('surveyorIds') && <FieldLabel field={label('surveyorIds')!} />}
        <Chips
          multi
          options={teamPeople.map((p) => ({ code: p.personId, label: p.name }))}
          value={surveyors}
          onChange={(v) => setSurveyors((v as string[] | undefined) ?? [])}
        />
        <P dim>{surveyors.length} surveyors. The start time is taken when you tap Start.</P>
      </ScrollView>
      <View style={styles.bottom}>
        <Button label="Start survey" onPress={start} disabled={!transectId} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFFFFF' },
  page: { padding: 16, gap: 12, paddingBottom: 24 },
  bottom: { padding: 16, borderTopWidth: 1, borderTopColor: '#DDDDDD' },
});
