import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { CounterBar } from '@/components/CounterBar';
import { Button, Card, H1, H2, P, colors } from '@/components/ui';
import { listRecords } from '@/db/records';
import { clockOf } from '@/lib/time';
import { missingForHq, type LocalEncounter, type LocalSurvey } from '@/model/records';
import { bootInfo } from '@/lib/boot';
import { DEMO_BUNDLE_NAME, demoHqBundleBytes } from '@/lib/demoBundle';
import { ROLE_LABEL, useField } from '@/state/field';
import { receiveHqBundle, type ReceiveResult } from '@/sync/receiveHq';

export default function Home() {
  const field = useField();
  const { project, template, person, pack } = field;
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

  const team = project?.teams.find((t) => t.teamId === person?.teamId);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <CounterBar />
      {project && <Button label="Send to HQ / receive from HQ" kind="secondary" onPress={() => router.push('/handover')} />}

      {recovered > 0 && (
        <Card>
          <P>
            ✓ Recovered {recovered} {recovered === 1 ? 'record' : 'records'} that {recovered === 1 ? 'was' : 'were'} still being
            typed when the app closed. Nothing was lost.
          </P>
        </Card>
      )}

      {!project && (
        <Card>
          <H1>Set up this phone</H1>
          <P>Load the project your Data Manager prepared. The demo project is built into the app, so this works offline.</P>
          <Button label={busy ? 'Loading…' : 'Load demo project'} onPress={loadDemo} disabled={busy} />
          <Button label="Receive a project from HQ (file)" kind="secondary" onPress={() => router.push('/handover')} />
        </Card>
      )}

      {received && (
        <Card>
          <H2>{received.ok ? 'What changed' : 'Not loaded'}</H2>
          {received.error && <P>{received.error}</P>}
          {received.changes.map((c) => (
            <P key={c}>• {c}</P>
          ))}
          {received.warnings.map((w) => (
            <P key={w}>⚠ {w}</P>
          ))}
        </Card>
      )}

      {project && (
        <Card>
          <H2>{project.name}</H2>
          <P dim>
            Form {template?.templateId} v{template?.coreVersion}
            {field.overlay ? ` · team changes ${field.overlay.overlayRev}` : ''} · {pack?.taxa.length ?? 0} species in the pack
          </P>
          {pack && <P dim>{pack.disclaimer}</P>}
        </Card>
      )}

      {project && !person && <Button label="Choose who is using this phone" onPress={() => router.push('/person')} />}

      {person && (
        <Card>
          <P>
            {person.name} · {ROLE_LABEL[person.role]} · {team?.name ?? person.teamId}
          </P>
          <P dim>Transects: {team?.transectIds.join(', ') || 'none assigned'}</P>
          <Button label="Switch person" kind="secondary" onPress={() => router.push('/person')} />
        </Card>
      )}

      {person && <Button label="Start a survey" onPress={() => router.push('/survey/new')} />}

      {person && <SurveyList />}

      <Button label="Storage check" kind="secondary" onPress={() => router.push('/storage')} />
    </ScrollView>
  );
}

function SurveyList() {
  const surveys = listRecords<LocalSurvey>('survey').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const encounters = listRecords<LocalEncounter>('encounter');
  if (surveys.length === 0) return <P dim>No surveys on this phone yet.</P>;
  return (
    <>
      <H2>Surveys on this phone</H2>
      {surveys.map((sv) => {
        const n = encounters.filter((e) => e.surveyId === sv.id && e.status === 'active').length;
        const incomplete = missingForHq(sv).length + encounters.filter((e) => e.surveyId === sv.id && missingForHq(e).length > 0).length;
        return (
          <Pressable
            key={sv.id}
            onPress={() => router.push({ pathname: '/survey/[id]', params: { id: sv.id } })}
            style={({ pressed }) => [styles.survey, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.surveyTitle}>
              {sv.transectId} · {sv.date} · {clockOf(sv.startedAt)}
              {sv.finishedAt ? `–${clockOf(sv.finishedAt)}` : ' · in progress'}
            </Text>
            <Text style={styles.surveySub}>
              {n} {n === 1 ? 'animal' : 'animals'}
              {incomplete > 0 ? ` · ${incomplete} still need details` : ''}
            </Text>
          </Pressable>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 48 },
  survey: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, minHeight: 64, gap: 4 },
  surveyTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  surveySub: { fontSize: 15, color: colors.dim },
});
