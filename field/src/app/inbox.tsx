// Corrections from HQ. Each was approved by a person at HQ (even when the AI drafted it); the surveyor
// still decides. Accepting makes a new version of the record; the old one is kept.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TextBox, s as fs } from '@/components/fields';
import { Button, Card, H2, P, colors } from '@/components/ui';
import { nowIso } from '@/lib/time';
import { useField } from '@/state/field';
import { acceptCorrection, declineCorrection, inbox, showValue, type InboxItem } from '@/sync/corrections';

export default function Inbox() {
  const field = useField();
  const { person, project, transects } = field;
  const [items, setItems] = useState(inbox);
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!person) return <P>Choose a person first.</P>;
  const ctx = () => ({ personId: person.personId, at: nowIso(project?.timeZone), project, transects });
  const done = () => {
    setItems(inbox());
    field.refresh();
  };
  const who = (code: string) => project?.people.find((p) => p.personId === code)?.name ?? code;

  const mine = items.filter((i) => i.record);
  const elsewhere = items.length - mine.length;

  const card = (i: InboxItem) => {
    const r = i.request;
    const name = i.record?.recordType === 'encounter' ? i.record.taxon.scientificName ?? 'Animal' : 'Survey';
    const changedSince = i.record && i.record.rev > r.rev;
    return (
      <Card key={r.correctionId}>
        <Text style={fs.label}>
          {name} · {r.fieldPath}
        </Text>
        <Text style={styles.change}>
          {showValue(r.current)} → {showValue(r.proposed)}
        </Text>
        <P>{r.reason}</P>
        <P dim>
          {r.source === 'ai-agent' ? 'Drafted by the AI reviewer, approved by ' : 'From '}
          {who(r.approvedBy)}
        </P>
        {changedSince && <P dim>⚠ This record was changed on the phone after HQ looked at it (version {r.rev} → {i.record!.rev}).</P>}
        {i.response ? (
          <P>
            {i.response.decision === 'accepted' ? `✓ Accepted (saved as version ${i.response.newRev})` : '✗ Declined'}
            {i.response.note ? `: ${i.response.note}` : ''}
          </P>
        ) : (
          <View style={styles.actions}>
            <Button
              label="Accept"
              onPress={() => {
                acceptCorrection(i, ctx());
                done();
              }}
            />
            <TextBox value={notes[r.correctionId]} onChange={(v) => setNotes({ ...notes, [r.correctionId]: v ?? '' })} />
            <Button
              label="Decline (note above optional)"
              kind="secondary"
              onPress={() => {
                declineCorrection(i, ctx(), notes[r.correctionId]);
                done();
              }}
            />
          </View>
        )}
      </Card>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <P dim>Your answers go back to HQ in the next bundle.</P>
      {mine.length === 0 && <P>No corrections for records on this phone.</P>}
      {mine.filter((i) => !i.response).map(card)}
      {mine.some((i) => i.response) && <H2>Answered</H2>}
      {mine.filter((i) => i.response).map(card)}
      {elsewhere > 0 && <P dim>{elsewhere} more are for records on other phones.</P>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 64 },
  change: { fontSize: 20, fontWeight: '800', color: colors.ink },
  actions: { gap: 10 },
});
