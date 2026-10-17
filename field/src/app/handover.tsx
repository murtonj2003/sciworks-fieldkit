// P9 · Hand data to HQ as a file (AirDrop, Quick Share, Files, USB) and take HQ's file back. No signal needed.
// Kit: the counter pinned first; the result slot under it (What changed, or the wrong-file message); Receive and
// Back up as one list; Sent / Received history with tiles. The Send to HQ card is docked in the bottom bar so its
// 72 px black pill stays in the thumb zone; after sending, the same dock shows "Bundle made" + "Share it again".
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BandMarker, Icon } from '@/components/Icon';
import { CounterBar } from '@/components/CounterBar';
import type { IconName } from '@/components/sprite';
import { BottomBar, Button, Group, GroupTitle, T } from '@/components/ui';
import { clockOf } from '@/lib/time';
import { useField } from '@/state/field';
import { receiveHqBundle, type ReceiveResult } from '@/sync/receiveHq';
import { listBundlesIn, listBundlesOut, makeFieldBundle, planBundle, type MadeBundle, type Scope } from '@/sync/sendField';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "16 Oct, 20:41" */
const when = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''}, ${clockOf(iso)}`;
const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const countsLine = (c: { surveys?: number; encounters: number; photos: number }) =>
  [c.surveys !== undefined ? plural(c.surveys, 'survey', 'surveys') : null, plural(c.encounters, 'animal', 'animals'), plural(c.photos, 'photo', 'photos')]
    .filter(Boolean)
    .join(' · ');

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingBottom: 24 },
  sticky: { backgroundColor: t.ground, paddingTop: 4 },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 54 },
  tile: { width: 30, height: 30, borderRadius: radius.tile, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...type.title, color: t.ink },
  rowSub: { ...type.sub, color: t.ink2 },
  rowSub13: { ...type.small, fontWeight: '400', color: t.ink2 },
  err: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 10, paddingTop: 11, paddingHorizontal: 14, paddingBottom: 12, borderRadius: radius.card, backgroundColor: t.offTint },
  errText: { ...type.sub, lineHeight: 20, color: t.offTintInk },
  errFile: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  errFileText: { ...type.small, fontWeight: '400', color: t.offTintInk, flexShrink: 1 },
  dock: { padding: 6, gap: 0 },
  carry: { ...type.sub, lineHeight: 20, color: t.ink, paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10 },
  how: { ...type.small, fontWeight: '400', lineHeight: 18, color: t.ink2, textAlign: 'center', paddingTop: 9, paddingHorizontal: 12, paddingBottom: 4 },
  bundle: { backgroundColor: t.card, borderRadius: radius.card, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 13, marginBottom: 6 },
  bundleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bundleTitle: { ...type.body, fontWeight: '600', color: t.ink },
  bundleFile: { ...type.sub, color: t.ink, marginTop: 5 },
}));

export default function Handover() {
  const field = useField();
  const s = useStyles();
  const { t } = useTheme();
  const [made, setMade] = useState<MadeBundle | null>(null);
  const [received, setReceived] = useState<ReceiveResult | null>(null);
  const [error, setError] = useState<{ message: string; file?: string } | null>(null);
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
      setError({ message: String((e as Error).message ?? e) });
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
    const asset = res.assets[0];
    try {
      const bytes = await new File(asset.uri).bytes();
      const r = receiveHqBundle(bytes, asset.name);
      if (r.ok) setReceived(r);
      else {
        setReceived(null);
        setError({ message: r.error ?? 'This file could not be read.', file: asset.name });
      }
      field.refresh();
      setPlan(planBundle('unconfirmed'));
    } catch (e) {
      setError({ message: String((e as Error).message ?? e), file: asset.name });
    } finally {
      setBusy(false);
    }
  }

  const { counter } = field;
  const history = [
    ...listBundlesOut().map((b) => ({
      key: `out-${b.fileName}`,
      at: b.createdAt,
      icon: 'upload' as IconName,
      title: `${b.scope === 'full' ? 'Backed up' : 'Sent'} · ${when(b.createdAt)}`,
      sub: countsLine(b.counts),
    })),
    ...listBundlesIn().map((b) => ({
      key: `in-${b.fileName}-${b.receivedAt}`,
      at: b.receivedAt,
      icon: 'download' as IconName,
      title: `Received · ${when(b.receivedAt)}`,
      sub: b.changes.find((c) => c.startsWith('HQ confirmed')) ?? b.changes[0] ?? b.fileName,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  const tile = (icon: IconName, tone: 'plain' | 'on' | 'dark' = 'plain') => (
    <View style={[s.tile, tone === 'on' && { backgroundColor: t.onFill }, tone === 'dark' && { backgroundColor: t.pri }]}>
      <Icon name={icon} size={18} color={tone === 'on' ? t.onInk : tone === 'dark' ? t.onPri : t.ink} strokeWidth={tone === 'on' ? 2.25 : 2} />
    </View>
  );

  /** One "What changed" line as a row: confirmations in mint, reviews, and the inbox as a dark tile that opens it. */
  const changeRow = (c: string, i: number) => {
    const inboxLine = /correction request/.test(c);
    const body = (
      <>
        {/confirmed/.test(c) ? tile('check', 'on') : /review result/.test(c) ? tile('reviewer') : inboxLine ? tile('inbox', 'dark') : tile('check')}
        <Text style={[s.rowTitle, { flex: 1 }]}>{c}</Text>
        {inboxLine && <Icon name="chev" size={20} color={t.ink2} />}
      </>
    );
    return (
      <View key={c}>
        {i > 0 && <View style={s.sep} />}
        {inboxLine ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/inbox')} style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }]}>
            {body}
          </Pressable>
        ) : (
          <View style={s.row}>{body}</View>
        )}
      </View>
    );
  };

  const actionRow = (icon: IconName, title: string, sub: string | null, onPress: () => void, first: boolean) => (
    <View key={title}>
      {!first && <View style={s.sep} />}
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }, busy && { opacity: 0.6 }]}
      >
        {tile(icon)}
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>{title}</Text>
          {sub ? <Text style={s.rowSub13}>{sub}</Text> : null}
        </View>
      </Pressable>
    </View>
  );

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={s.page} stickyHeaderIndices={[0]}>
        <View style={s.sticky}>
          <CounterBar totals={false} />
        </View>

        {error && (
          <View style={s.err} accessibilityRole="alert">
            <BandMarker band="outside-bbox" size={20} />
            <View style={{ flex: 1 }}>
              <Text style={s.errText}>{error.message}</Text>
              {error.file && (
                <View style={s.errFile}>
                  <Icon name="file" size={15} color={t.offTintInk} />
                  <Text style={s.errFileText}>{error.file}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {received && (
          <>
            <GroupTitle>What changed</GroupTitle>
            <Group>
              <View style={s.list}>{received.changes.map(changeRow)}</View>
            </Group>
            {received.warnings.map((w) => (
              <T key={w} v="small" dim style={{ fontWeight: '400', marginTop: 6, marginHorizontal: 6 }}>
                {w}
              </T>
            ))}
          </>
        )}

        <Group style={{ marginTop: 10 }}>
          <View style={s.list}>
            {actionRow('download', 'Receive from HQ', null, receive, true)}
            {actionRow(
              'phone',
              'Back up my phone (everything)',
              `${plural(counter.totalRecords, 'record', 'records')} and ${plural(counter.totalPhotos, 'photo', 'photos')} on this phone`,
              () => send('full'),
              false,
            )}
          </View>
        </Group>

        {history.length > 0 && (
          <>
            <GroupTitle>Sent / Received</GroupTitle>
            <Group>
              <View style={s.list}>
                {history.map((h, i) => (
                  <View key={h.key}>
                    {i > 0 && <View style={s.sep} />}
                    <View style={s.row}>
                      {tile(h.icon)}
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle}>{h.title}</Text>
                        <Text style={s.rowSub} numberOfLines={1}>
                          {h.sub}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </Group>
          </>
        )}
      </ScrollView>

      <BottomBar>
        <Group style={s.dock}>
          {made ? (
            <>
              <View style={s.bundle}>
                <View style={s.bundleHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Icon name="check" size={20} color={t.ink} strokeWidth={2.25} />
                    <Text style={s.bundleTitle}>Bundle made</Text>
                  </View>
                  <Text style={s.rowSub}>{kb(made.bytes)}</Text>
                </View>
                <Text style={s.bundleFile}>{made.fileName}</Text>
                <Text style={[s.rowSub, { marginTop: 2 }]}>{countsLine(made.counts)}</Text>
                {made.counts.problems.map((p) => (
                  <Text key={p} style={[s.rowSub13, { marginTop: 4 }]}>
                    {p}
                  </Text>
                ))}
              </View>
              <Button
                label="Share it again"
                kind="white"
                size={64}
                icon="upload"
                onPress={() => Sharing.shareAsync(made.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive' })}
              />
            </>
          ) : (
            <>
              <Text style={s.carry}>
                Carries {plural(plan.surveys.length, 'survey', 'surveys')}, {plural(plan.encounters.length, 'animal', 'animals')} and{' '}
                {plural(plan.photos.length, 'photo', 'photos')} that HQ hasn't confirmed, plus your team's form changes and requests. Sending again is
                always safe.
              </Text>
              <Button label={busy ? 'Working…' : 'Send to HQ'} icon={busy ? undefined : 'send'} size={72} onPress={() => send('unconfirmed')} disabled={busy} />
            </>
          )}
          <Text style={s.how}>AirDrop, Quick Share, a cable or Files. Nothing is deleted from this phone.</Text>
        </Group>
      </BottomBar>
    </View>
  );
}
