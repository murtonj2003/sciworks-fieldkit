// P2a · Start a survey (fidelity pass, comp 1D's language): the transect as a 1D row (satellite thumb, name, length,
// ringed when chosen) and who is walking it as rows with a round tick, then Start (the time is taken automatically).
// Home already shows the map, so this screen doesn't repeat it.
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { TransectThumb } from '@/components/TransectMap';
import { BottomBar, Button, Group, TrayTitle, T } from '@/components/ui';
import { saveDraftNow, seal } from '@/db/records';
import { effectiveFields, withDefaults } from '@/model/form';
import { newSurvey } from '@/model/factory';
import { astroAtStart } from '@/model/survey';
import { ROLE_LABEL, useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 14 },
  help: { ...type.sub, color: t.ink2, marginHorizontal: 6 },
  trow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, paddingRight: 14, borderRadius: radius.card, backgroundColor: t.card, borderWidth: 2, borderColor: 'transparent' },
  trowOn: { borderColor: t.ink },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  prow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 14 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 14 },
  tick: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
}));

export default function NewSurvey() {
  const field = useField();
  const { project, template, person, transects, overlay } = field;
  const s = useStyles();
  const { t } = useTheme();
  const team = project?.teams.find((x) => x.teamId === person?.teamId);
  const own = (id: string) => !!team?.transectIds.includes(id);
  // The project's transects, this team's first (as on Home); Home's chosen one arrives as a param.
  const all = [...(transects?.features ?? [])].sort((a, b) => Number(!own(a.properties.transectId)) - Number(!own(b.properties.transectId)));
  const params = useLocalSearchParams<{ transectId?: string }>();
  const [transectId, setTransectId] = useState<string | undefined>(
    all.find((f) => f.properties.transectId === params.transectId)?.properties.transectId ?? all[0]?.properties.transectId,
  );
  const [surveyors, setSurveyors] = useState<string[]>(person ? [person.personId] : []);

  if (!project || !template || !person) return <T>Load a project and choose a person first.</T>;
  const fields = effectiveFields(template, overlay, 'survey');
  const teamPeople = project.people.filter((p) => p.teamId === person.teamId);
  const teamOf = (id: string) => project.teams.find((x) => x.transectIds.includes(id));

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

  const toggle = (id: string) => setSurveyors((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const n = surveyors.length || 1;
  return (
    <View style={s.wrap}>
      <Stack.Screen options={{ title: transectId ? `Start ${transectId}` : 'New survey' }} />
      <ScrollView contentContainerStyle={s.page}>
        <Group style={{ gap: 6 }}>
          <TrayTitle>Transect</TrayTitle>
          {all.map((f) => {
            const id = f.properties.transectId;
            const on = id === transectId;
            const other = !own(id) ? teamOf(id)?.name : undefined;
            return (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setTransectId(id)}
                style={({ pressed }) => [s.trow, on && s.trowOn, pressed && { backgroundColor: t.secPress }]}
              >
                <TransectThumb transect={f} size={48} width={60} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.title, { fontSize: 16, fontWeight: '500', color: t.ink }]} numberOfLines={1}>
                    {f.properties.name.replace(/\s*\(.*\)\s*$/, '')}
                  </Text>
                  <T v="sub" dim numberOfLines={1}>
                    {other ? `${other} · ` : ''}
                    {`${thousands(f.properties.lengthM)}\u00a0m`}
                    {/demo geometry/i.test(f.properties.name) ? ' · demo line' : ''}
                  </T>
                </View>
                {on && <Icon name="check" size={20} color={t.ink} strokeWidth={2.25} />}
              </Pressable>
            );
          })}
        </Group>

        <Group style={{ gap: 6 }}>
          <TrayTitle>Surveyors</TrayTitle>
          <View style={s.list}>
            {teamPeople.map((p, i) => {
              const on = surveyors.includes(p.personId);
              return (
                <View key={p.personId}>
                  {i > 0 && <View style={s.sep} />}
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggle(p.personId)}
                    style={({ pressed }) => [s.prow, pressed && { backgroundColor: t.secPress }]}
                  >
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={[type.body, { color: t.ink }]}>{p.name}</Text>
                      <Text style={[type.sub, { color: t.ink2 }]}>
                        {ROLE_LABEL[p.role]}
                        {p.personId === person.personId ? ' · this phone' : ''}
                      </Text>
                    </View>
                    <View style={[s.tick, on ? { backgroundColor: t.pri } : { borderWidth: 2, borderColor: t.track }]}>
                      {on && <Icon name="check" size={16} color={t.onPri} strokeWidth={2.5} />}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Group>
        <Text style={s.help}>
          {surveyors.length === 0
            ? "No one ticked. You'll be the surveyor. The start time is taken when you tap Start."
            : `${n} ${n === 1 ? 'surveyor' : 'surveyors'}. The start time is taken when you tap Start.`}
        </Text>
      </ScrollView>
      <BottomBar>
        <Button label="Start survey" size={64} onPress={start} disabled={!transectId} />
      </BottomBar>
    </View>
  );
}
