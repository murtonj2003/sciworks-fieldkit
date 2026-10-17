// Hand data to HQ as a file (AirDrop, Quick Share, Files, USB) and take HQ's file back. No signal needed.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { CounterBar } from '@/components/CounterBar';
import { Button, Card, H2, P } from '@/components/ui';
import { clockOf } from '@/lib/time';
import { useField } from '@/state/field';
import { receiveHqBundle, type ReceiveResult } from '@/sync/receiveHq';
import { listBundlesIn, listBundlesOut, makeFieldBundle, planBundle, type MadeBundle, type Scope } from '@/sync/sendField';

const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export default function Handover() {
  const field = useField();
  const [made, setMade] = useState<MadeBundle | null>(null);
  const [received, setReceived] = useState<ReceiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(() => planBundle('unconfirmed'));

  async function send(scope: Scope) {
    setBusy(true);
    setError(null);
    setReceived(null);
    try {
      const b = await makeFieldBundle(field, scope);
      setMade(b);
      field.refresh();
      setPlan(planBundle('unconfirmed'));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(b.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive', dialogTitle: 'Send to HQ' });
      }
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function receive() {
    setError(null);
    setMade(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/zip', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    try {
      const asset = res.assets[0];
      const bytes = await new File(asset.uri).bytes();
      setReceived(receiveHqBundle(bytes, asset.name));
      field.refresh();
      setPlan(planBundle('unconfirmed'));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const outs = listBundlesOut();
  const ins = listBundlesIn();

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <CounterBar />

      <Card>
        <H2>Send to HQ</H2>
        <P>
          Carries {plan.surveys.length} surveys, {plan.encounters.length} animals and {plan.photos.length} photos that HQ hasn't
          confirmed, plus your team's form changes and requests. Sending again is always safe.
        </P>
        <Button label={busy ? 'Working…' : 'Send to HQ'} onPress={() => send('unconfirmed')} disabled={busy} />
        <P dim>AirDrop, Quick Share, a cable or Files. Nothing is deleted from this phone.</P>
      </Card>

      <Button label="Back up my phone (everything)" kind="secondary" onPress={() => send('full')} disabled={busy} />
      <Button label="Receive from HQ" kind="secondary" onPress={receive} disabled={busy} />

      {error && (
        <Card>
          <P>⚠ {error}</P>
        </Card>
      )}

      {made && (
        <Card>
          <H2>Bundle made</H2>
          <P>
            {made.fileName} · {kb(made.bytes)}
          </P>
          <P dim>
            {made.counts.surveys} surveys · {made.counts.encounters} animals · {made.counts.photos} photos
          </P>
          {made.counts.problems.map((p) => (
            <P key={p}>⚠ {p}</P>
          ))}
          <Button
            label="Share it again"
            kind="secondary"
            onPress={() => Sharing.shareAsync(made.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' })}
          />
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

      {outs.length > 0 && <H2>Sent</H2>}
      {outs.slice(0, 8).map((b) => (
        <P key={b.fileName} dim>
          {b.createdAt.slice(0, 10)} {clockOf(b.createdAt)} · {b.scope === 'full' ? 'backup' : 'to HQ'} · {b.counts.encounters} animals,{' '}
          {b.counts.photos} photos
        </P>
      ))}
      {ins.length > 0 && <H2>Received</H2>}
      {ins.slice(0, 8).map((b) => (
        <P key={b.fileName + b.receivedAt} dim>
          {b.receivedAt.slice(0, 10)} {clockOf(b.receivedAt)} · {b.fileName}
        </P>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 48 },
});
