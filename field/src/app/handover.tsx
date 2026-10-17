// P9 · Hand data to HQ as a file (AirDrop, Quick Share, Files, USB) and take HQ's file back. No signal needed.
// Kit: counter first; the Send to HQ group (sentence + black pill + channels); Receive and Back up as row
// buttons; Bundle made / What changed cards; Sent and Received history.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { CounterBar } from '@/components/CounterBar';
import { BandMarker, Icon } from '@/components/Icon';
import type { IconName } from '@/components/sprite';
import { Button, Group, GroupTitle, Hint, Row, T } from '@/components/ui';
import { clockOf } from '@/lib/time';
import { useField } from '@/state/field';
import { receiveHqBundle, type ReceiveResult } from '@/sync/receiveHq';
import { listBundlesIn, listBundlesOut, makeFieldBundle, planBundle, type MadeBundle, type Scope } from '@/sync/sendField';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 10 },
  rowBtn: { minHeight: 56, borderRadius: radius.card, backgroundColor: t.sec, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  rowBtnTitle: { ...type.title, color: t.ink },
  rowBtnSub: { ...type.sub, color: t.ink2 },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  hrow: { minHeight: 52, paddingVertical: 8, paddingHorizontal: 14, justifyContent: 'center', gap: 1 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 14 },
  line: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
}));

export default function Handover() {
  const field = useField();
  const s = useStyles();
  const { t } = useTheme();
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

  const rowButton = (icon: IconName, title: string, sub: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [s.rowBtn, pressed && { backgroundColor: t.secPress }, busy && { opacity: 0.6 }]}
    >
      <Icon name={icon} size={22} color={t.ink} strokeWidth={2} />
      <View style={{ flex: 1, paddingVertical: 8 }}>
        <Text style={s.rowBtnTitle}>{title}</Text>
        <Text style={s.rowBtnSub}>{sub}</Text>
      </View>
      <Icon name="chev" size={20} color={t.ink2} />
    </Pressable>
  );

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={s.page}>
        <CounterBar />

        <GroupTitle>Send to HQ</GroupTitle>
        <Group style={{ gap: 8 }}>
          <Row>
            <T v="body">
              Carries {plural(plan.surveys.length, 'survey', 'surveys')}, {plural(plan.encounters.length, 'animal', 'animals')} and{' '}
              {plural(plan.photos.length, 'photo', 'photos')} that HQ hasn't confirmed, plus your team's form changes and requests. Sending
              again is always safe.
            </T>
          </Row>
          <Button label={busy ? 'Working…' : 'Send to HQ'} icon="send" onPress={() => send('unconfirmed')} disabled={busy} />
          <T v="small" dim style={{ fontWeight: '400', textAlign: 'center', marginBottom: 4 }}>
            AirDrop, Quick Share, a cable or Files. Nothing is deleted from this phone.
          </T>
        </Group>

        {error && <Hint>{error}</Hint>}

        {made && (
          <Group>
            <Row style={{ gap: 6 }}>
              <View style={s.line}>
                <BandMarker band="green" size={20} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="title">Bundle made</T>
                  <T v="sub" dim>
                    {made.fileName} · {kb(made.bytes)}
                  </T>
                  <T v="sub" dim>
                    {plural(made.counts.surveys, 'survey', 'surveys')} · {plural(made.counts.encounters, 'animal', 'animals')} ·{' '}
                    {plural(made.counts.photos, 'photo', 'photos')}
                  </T>
                </View>
              </View>
              {made.counts.problems.map((p) => (
                <Hint key={p} line>
                  {p}
                </Hint>
              ))}
            </Row>
            <Button
              label="Share it again"
              kind="white"
              size={56}
              icon="upload"
              onPress={() => Sharing.shareAsync(made.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' })}
            />
          </Group>
        )}

        {received && (
          <Group>
            <Row style={{ gap: 6 }}>
              <T v="title">{received.ok ? 'What changed' : 'Not loaded'}</T>
              {received.error && <T v="sub">{received.error}</T>}
              {received.changes.map((c) => (
                <View key={c} style={s.line}>
                  <Icon name="check" size={16} color={t.onMark} strokeWidth={2.25} />
                  <T v="sub" style={{ flex: 1 }}>
                    {c}
                  </T>
                </View>
              ))}
              {received.warnings.map((w) => (
                <Hint key={w} line>
                  {w}
                </Hint>
              ))}
            </Row>
          </Group>
        )}

        <Group style={{ gap: 6 }}>
          {rowButton('download', 'Receive from HQ', 'Open the file HQ sent: set-up, receipts, corrections', receive)}
          {rowButton('bundle', 'Back up my phone', 'Everything on this phone, in one file', () => send('full'))}
        </Group>

        {outs.length > 0 && (
          <>
            <GroupTitle>Sent</GroupTitle>
            <Group>
              <View style={s.list}>
                {outs.slice(0, 8).map((b, i) => (
                  <View key={b.fileName}>
                    {i > 0 && <View style={s.sep} />}
                    <View style={s.hrow}>
                      <T v="body">
                        {b.createdAt.slice(0, 10)} {clockOf(b.createdAt)} · {b.scope === 'full' ? 'Backup' : 'To HQ'}
                      </T>
                      <T v="sub" dim>
                        {plural(b.counts.encounters, 'animal', 'animals')}, {plural(b.counts.photos, 'photo', 'photos')}
                      </T>
                    </View>
                  </View>
                ))}
              </View>
            </Group>
          </>
        )}
        {ins.length > 0 && (
          <>
            <GroupTitle>Received</GroupTitle>
            <Group>
              <View style={s.list}>
                {ins.slice(0, 8).map((b, i) => (
                  <View key={b.fileName + b.receivedAt}>
                    {i > 0 && <View style={s.sep} />}
                    <View style={s.hrow}>
                      <T v="body">
                        {b.receivedAt.slice(0, 10)} {clockOf(b.receivedAt)}
                      </T>
                      <T v="sub" dim numberOfLines={1}>
                        {b.fileName}
                      </T>
                    </View>
                  </View>
                ))}
              </View>
            </Group>
          </>
        )}
      </ScrollView>
    </View>
  );
}
