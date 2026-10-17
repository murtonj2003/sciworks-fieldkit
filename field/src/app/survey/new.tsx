// P2a · Start a survey: pick the transect and who is walking it, then Start (the time is taken automatically).
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Chips } from '@/components/fields';
import { TransectMap } from '@/components/TransectMap';
import { BottomBar, Button, GroupTitle, T } from '@/components/ui';
import { saveDraftNow, seal } from '@/db/records';
import { effectiveFields, withDefaults } from '@/model/form';
import { newSurvey } from '@/model/factory';
import { astroAtStart } from '@/model/survey';
import { useField } from '@/state/field';
import { makeStyles } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  help: { ...type.small, fontWeight: '400', color: t.ink2, marginTop: 6, marginHorizontal: 4 },
  mapCard: { backgroundColor: t.card, borderRadius: radius.card, paddingHorizontal: 6, paddingVertical: 4 },
}));

export default function NewSurvey() {
  const field = useField();
  const { project, template, person, transects, overlay } = field;
  const s = useStyles();
  const team = project?.teams.find((x) => x.teamId === person?.teamId);
  const teamTransects = (transects?.features ?? []).filter((f) => team?.transectIds.includes(f.properties.transectId));
  // Home's chosen transect (design pick 1D) arrives as a param; otherwise the team's first.
  const params = useLocalSearchParams<{ transectId?: string }>();
  const [transectId, setTransectId] = useState<string | undefined>(
    teamTransects.find((f) => f.properties.transectId === params.transectId)?.properties.transectId ?? teamTransects[0]?.properties.transectId,
  );
  const [surveyors, setSurveyors] = useState<string[]>(person ? [person.personId] : []);

  if (!project || !template || !person) return <T>Load a project and choose a person first.</T>;
  const fields = effectiveFields(template, overlay, 'survey');
  const teamPeople = project.people.filter((p) => p.teamId === person.teamId);
  const chosen = teamTransects.find((f) => f.properties.transectId === transectId);

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

  const n = surveyors.length || 1;
  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={s.page}>
        <GroupTitle>Transect</GroupTitle>
        <Chips
          onGround
          options={teamTransects.map((f) => ({ code: f.properties.transectId, label: f.properties.transectId }))}
          value={transectId}
          onChange={(v) => setTransectId(v as string | undefined)}
        />
        {chosen && (
          <>
            <Text style={s.help}>
              {chosen.properties.name} · {`${thousands(chosen.properties.lengthM)}\u00a0m`}
            </Text>
            <View style={[s.mapCard, { marginTop: 10 }]}>
              <TransectMap transect={chosen} />
            </View>
          </>
        )}
        <View style={{ height: 10 }} />
        <GroupTitle>Surveyors</GroupTitle>
        <Chips
          onGround
          multi
          options={teamPeople.map((p) => ({ code: p.personId, label: p.name }))}
          value={surveyors}
          onChange={(v) => setSurveyors((v as string[] | undefined) ?? [])}
        />
        <Text style={s.help}>
          {surveyors.length === 0
            ? "No one ticked. You'll be the surveyor. The start time is taken when you tap Start."
            : `${n} ${n === 1 ? 'surveyor' : 'surveyors'}. The start time is taken when you tap Start.`}
        </Text>
      </ScrollView>
      <BottomBar>
        <Button label="Start survey" size={72} onPress={start} disabled={!transectId} />
      </BottomBar>
    </View>
  );
}
