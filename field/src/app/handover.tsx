// P9 · Hand data to HQ as a file, and take HQ's file back. No signal needed for most routes.
// Round 2 (Jack's picks S2 + U1): a journey picture (phone → file → HQ) that fills in as you go, three steps
// (Make file · Share · Done), the routes to HQ each marked honestly "Works now" or "Needs internet", and a clear
// "This won't reach HQ yet" card when email is chosen with no internet. The counter stays pinned on top;
// Receive from HQ, Back up and the Sent / Received history sit below.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { BandMarker, Icon } from '@/components/Icon';
import { CounterBar } from '@/components/CounterBar';
import type { IconName } from '@/components/sprite';
import { BottomBar, Button, Group, GroupTitle, T } from '@/components/ui';
import { checkOnline } from '@/lib/online';
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

/** The nearby route has a different name on each platform. */
const NEARBY = Platform.OS === 'ios' ? 'AirDrop' : 'Quick Share';

type Stage = 'make' | 'share' | 'done';
type Route = 'nearby' | 'cable' | 'email';

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingBottom: 24 },
  sticky: { backgroundColor: t.ground, paddingTop: 4, paddingBottom: 6 },
  journey: { backgroundColor: t.card, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 10, marginTop: 10 },
  jRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  node: { alignItems: 'center', width: 78, gap: 6 },
  disc: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: t.tile },
  nodeText: { ...type.small, color: t.ink, textAlign: 'center' },
  badge: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.card },
  arrow: { paddingTop: 18 },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { width: 8, height: 8, borderRadius: 4 },
  stepText: { ...type.small },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 54 },
  tile: { width: 30, height: 30, borderRadius: radius.tile, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...type.title, color: t.ink },
  rowSub: { ...type.sub, color: t.ink2 },
  rowSub13: { ...type.small, fontWeight: '400', color: t.ink2 },
  tag: { minHeight: 24, paddingHorizontal: 8, borderRadius: radius.tag, justifyContent: 'center' },
  tagText: { ...type.small, fontWeight: '600' },
  err: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 10, paddingTop: 11, paddingHorizontal: 14, paddingBottom: 12, borderRadius: radius.card, backgroundColor: t.offTint },
  errTitle: { ...type.title, color: t.offTintInk },
  errText: { ...type.sub, lineHeight: 20, color: t.offTintInk },
  errFile: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  errFileText: { ...type.small, fontWeight: '400', color: t.offTintInk, flexShrink: 1 },
  carry: { ...type.sub, lineHeight: 20, color: t.ink, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 12 },
  bundle: { backgroundColor: t.card, borderRadius: radius.card, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 13 },
  bundleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bundleTitle: { ...type.body, fontWeight: '600', color: t.ink },
  bundleFile: { ...type.sub, color: t.ink, marginTop: 5 },
  doneCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: t.onFill, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 },
  doneText: { ...type.sub, lineHeight: 20, color: t.onInk, flex: 1 },
  how: { ...type.small, fontWeight: '400', lineHeight: 18, color: t.ink2, textAlign: 'center', paddingTop: 2, paddingHorizontal: 12 },
}));

/** A zipped file (the bundle), in the kit's 24-grid stroke. */
function Zip({ color, size = 26 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <Path d="M14 3.5V8h4.5" />
      <Path d="M11 5.5h1M11 7.5h1M11 9.5h1M11 11.5h1" />
      <Rect x={10.25} y={13} width={2.5} height={3.5} rx={0.8} />
    </Svg>
  );
}

/** A laptop, drawn in the kit's 24-grid stroke (the sprite has no laptop). */
function Laptop({ color, size = 26 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4.5} y={5.5} width={15} height={10} rx={1.5} />
      <Path d="M2.5 18.5h19" />
    </Svg>
  );
}

export default function Handover() {
  const field = useField();
  const s = useStyles();
  const { t } = useTheme();
  const [made, setMade] = useState<MadeBundle | null>(null);
  const [stage, setStage] = useState<Stage>('make');
  const [received, setReceived] = useState<ReceiveResult | null>(null);
  const [error, setError] = useState<{ message: string; file?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [offlineEmail, setOfflineEmail] = useState(false);
  const [plan, setPlan] = useState(() => planBundle('unconfirmed'));

  async function make(scope: Scope) {
    setBusy(true);
    setError(null);
    setReceived(null);
    setOfflineEmail(false);
    try {
      const b = await makeFieldBundle(field, scope);
      setMade(b);
      setStage('share');
      field.refresh();
      setPlan(planBundle('unconfirmed'));
      setOnline(await checkOnline());
    } catch (e) {
      setError({ message: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!made) return;
    setOfflineEmail(false);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(made.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive', dialogTitle: 'Send to HQ' });
    }
    setStage('done');
  }

  async function pickRoute(r: Route) {
    if (r === 'email') {
      const now = await checkOnline();
      setOnline(now);
      if (!now) {
        setOfflineEmail(true); // say so plainly before the share sheet, never after a silent failure
        return;
      }
    }
    await share();
  }

  async function receive() {
    setError(null);
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

  const tile = (icon: IconName) => (
    <View style={s.tile}>
      <Icon name={icon} size={18} color={t.ink} strokeWidth={2} />
    </View>
  );

  // ---- the journey picture: phone → file → HQ ----
  const confirmed = !!received?.changes.some((c) => c.startsWith('HQ confirmed'));
  const node = (label: string, art: React.ReactNode, state: 'now' | 'done' | 'wait' | 'idle') => (
    <View style={s.node}>
      <View
        style={[
          s.disc,
          state === 'now' && { backgroundColor: t.card, borderWidth: 2, borderColor: t.ink },
          state === 'done' && { backgroundColor: t.onFill },
        ]}
      >
        {art}
        {state === 'done' && (
          <View style={[s.badge, { backgroundColor: t.onMark }]}>
            <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3} />
          </View>
        )}
        {state === 'wait' && (
          <View style={[s.badge, { backgroundColor: t.nearFill }]}>
            <Icon name="clock" size={12} color={t.nearInk} strokeWidth={2.5} />
          </View>
        )}
      </View>
      <Text style={s.nodeText}>{label}</Text>
    </View>
  );
  const phoneState = stage === 'make' ? 'now' : 'done';
  const fileState = stage === 'make' ? 'idle' : stage === 'share' ? 'now' : 'done';
  const hqState = confirmed ? 'done' : stage === 'done' || offlineEmail ? 'wait' : 'idle';
  const journey = (
    <View style={s.journey} accessibilityLabel={`Phone, then the file, then HQ. Step: ${stage === 'make' ? 'make the file' : stage === 'share' ? 'share it' : 'done'}.`}>
      <View style={s.jRow}>
        {node('This phone', <Icon name="phone" size={26} color={t.ink} strokeWidth={1.75} />, phoneState)}
        <View style={s.arrow}>
          <Icon name="arrow" size={20} color={t.ink2} />
        </View>
        {node(made ? `File · ${kb(made.bytes)}` : 'File', <Zip color={t.ink} />, fileState)}
        <View style={s.arrow}>
          <Icon name="arrow" size={20} color={t.ink2} />
        </View>
        {node(hqState === 'wait' ? 'HQ · waiting' : 'HQ laptop', <Laptop color={t.ink} />, hqState)}
      </View>
      <View style={s.steps}>
        {(['make', 'share', 'done'] as const).map((k, i) => {
          const on = k === stage;
          const past = (['make', 'share', 'done'] as const).indexOf(stage) > i;
          return (
            <View key={k} style={s.step}>
              <View style={[s.stepDot, { backgroundColor: on ? t.ink : past ? t.onMark : t.track }]} />
              <Text style={[s.stepText, { color: on ? t.ink : t.ink2, fontWeight: on ? '700' : '500' }]}>{k === 'make' ? 'Make file' : k === 'share' ? 'Share' : 'Done'}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );

  const routeTag = (kind: 'ok' | 'net' | 'off') => (
    <View style={[s.tag, { backgroundColor: kind === 'ok' ? t.onFill : kind === 'off' ? t.nearFill : t.tile }]}>
      <Text style={[s.tagText, { color: kind === 'ok' ? t.onInk : kind === 'off' ? t.nearInk : t.ink }]}>
        {kind === 'ok' ? 'Works now' : kind === 'off' ? 'No internet' : 'Needs internet'}
      </Text>
    </View>
  );
  const routeRow = (r: Route, icon: IconName, title: string, sub: string, tagKind: 'ok' | 'net' | 'off', i: number) => (
    <View key={r}>
      {i > 0 && <View style={s.sep} />}
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} onPress={() => pickRoute(r)} style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }]}>
        {tile(icon)}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.rowTitle}>{title}</Text>
          <Text style={s.rowSub13}>{sub}</Text>
        </View>
        {routeTag(tagKind)}
        <Icon name="chev" size={18} color={t.ink2} />
      </Pressable>
    </View>
  );

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={s.page} stickyHeaderIndices={[0]}>
        <View style={s.sticky}>
          <CounterBar totals={false} />
        </View>

        {journey}

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

        {stage === 'make' && (
          <Group style={{ marginTop: 10 }}>
            <View style={s.list}>
              <Text style={s.carry}>
                Carries {plural(plan.surveys.length, 'survey', 'surveys')}, {plural(plan.encounters.length, 'animal', 'animals')} and{' '}
                {plural(plan.photos.length, 'photo', 'photos')} that HQ hasn't confirmed, plus your team's form changes and requests. Sending again is
                always safe.
              </Text>
            </View>
          </Group>
        )}

        {stage !== 'make' && made && (
          <Group style={{ marginTop: 10 }}>
            <View style={s.bundle}>
              <View style={s.bundleHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[s.tile, { width: 40, height: 40 }]}>
                    <Zip color={t.ink} size={24} />
                  </View>
                  <Text style={s.bundleTitle}>File made</Text>
                </View>
                <Text style={s.rowSub}>{kb(made.bytes)}</Text>
              </View>
              <Text style={s.bundleFile} numberOfLines={1} ellipsizeMode="middle">
                {made.fileName}
              </Text>
              <Text style={[s.rowSub, { marginTop: 2 }]}>{countsLine(made.counts)}</Text>
              {made.counts.problems.map((p) => (
                <Text key={p} style={[s.rowSub13, { marginTop: 4 }]}>
                  {p}
                </Text>
              ))}
            </View>
          </Group>
        )}

        {stage === 'share' && made && !offlineEmail && (
          <>
            <GroupTitle>How will it reach HQ?</GroupTitle>
            <Group>
              <View style={s.list}>
                {routeRow('nearby', 'users', `Nearby: ${NEARBY}`, 'No internet needed · phone and HQ side by side', 'ok', 0)}
                {routeRow('cable', 'folder', 'Cable or Files', 'No internet needed · plug into the HQ laptop', 'ok', 1)}
                {routeRow('email', 'send', 'Email (Gmail)', 'Needs internet · waits in the Outbox if offline', online === false ? 'off' : online ? 'ok' : 'net', 2)}
              </View>
            </Group>
          </>
        )}
        {stage === 'share' && made && offlineEmail && (
          <View style={[s.err, { flexDirection: 'column', gap: 8 }]} accessibilityRole="alert">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="warning" size={22} color={t.offTintInk} strokeWidth={2} />
              <Text style={s.errTitle}>This won't reach HQ yet</Text>
            </View>
            <Text style={s.errText}>
              There's no internet here, so email can't send now. The file is safe on this phone. Hand it over nearby or by cable now, or let Gmail
              keep it in the Outbox until you reconnect.
            </Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              <Button label={`Use ${NEARBY} instead`} size={56} onPress={share} />
              <Button label="Keep it in the Outbox" kind="white" size={48} onPress={share} />
              <Button kind="link" label="Back to the routes" onPress={() => setOfflineEmail(false)} />
            </View>
          </View>
        )}

        {stage === 'done' && made && (
          <Group style={{ marginTop: 10, gap: 6 }}>
            <View style={s.doneCard}>
              <Icon name="check" size={20} color={t.onInk} strokeWidth={2.5} />
              <Text style={s.doneText}>
                Shared. When HQ has imported it, they send a file back: open it with Receive from HQ and the counter goes down.
              </Text>
            </View>
            <Button label="Share it again" kind="white" size={48} icon="upload" onPress={() => setStage('share')} />
          </Group>
        )}

        {received && (
          <>
            <GroupTitle>What changed</GroupTitle>
            <Group>
              <View style={s.list}>
                {received.changes.map((c, i) => (
                  <View key={c}>
                    {i > 0 && <View style={s.sep} />}
                    <View style={s.row}>
                      {tile(/confirmed/.test(c) ? 'check' : /correction/.test(c) ? 'inbox' : 'check')}
                      <Text style={[s.rowTitle, { flex: 1 }]}>{c}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Group>
            {received.changes.some((c) => /correction request/.test(c)) && (
              <Button label="Open corrections from HQ" kind="white" size={48} onPress={() => router.push('/inbox')} style={{ marginTop: 8 }} />
            )}
          </>
        )}

        <Group style={{ marginTop: 10 }}>
          <View style={s.list}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={receive} style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }, busy && { opacity: 0.6 }]}>
              {tile('download')}
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Receive from HQ</Text>
                <Text style={s.rowSub13}>Open the file HQ sent back</Text>
              </View>
            </Pressable>
            <View style={s.sep} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => make('full')} style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }, busy && { opacity: 0.6 }]}>
              {tile('phone')}
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Back up my phone (everything)</Text>
                <Text style={s.rowSub13}>
                  {plural(counter.totalRecords, 'record', 'records')} and {plural(counter.totalPhotos, 'photo', 'photos')} on this phone
                </Text>
              </View>
            </Pressable>
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
        {stage === 'make' && (
          <Button label={busy ? 'Making the file…' : 'Send to HQ'} icon={busy ? undefined : 'send'} size={72} onPress={() => make('unconfirmed')} disabled={busy} />
        )}
        {stage === 'share' && <Button label="Share the file" icon="upload" kind={offlineEmail ? 'grey' : 'primary'} size={offlineEmail ? 56 : 64} onPress={share} />}
        {stage === 'done' && <Button label="Done" size={64} onPress={() => router.back()} />}
        <Text style={s.how}>Nothing is deleted from this phone.</Text>
      </BottomBar>
    </View>
  );
}
