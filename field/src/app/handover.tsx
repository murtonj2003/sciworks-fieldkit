// P9 · Hand data to HQ as a file, and take HQ's file back. No signal needed for most routes.
// Round 2 fidelity pass (Jack's hybrid of S2 + U1): a real step indicator (Make file · Share · Done), the phone →
// file → HQ journey that fills in as you go, the S2 file card (centred zip tile, full name, size, counts), each route
// in its own card with an honest tag, and a "This won't reach HQ yet" card when email is chosen with no internet:
// the page scrolls back up so the journey tells the story (file made and safe, HQ greyed and waiting). The counter
// is not repeated here. Receive from HQ, Back up and the last two hand-overs sit under "Other things" on Make only.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { BandMarker, Icon } from '@/components/Icon';
import type { IconName } from '@/components/sprite';
import { BottomBar, Button, Group, GroupTitle, TrayTitle } from '@/components/ui';
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
/** Journey disc: now = ink ring · done = mint + tick · wait = outline + amber clock · off = greyed + grey clock. */
type NodeState = 'now' | 'done' | 'wait' | 'off' | 'idle';
const STEPS: { key: Stage; label: string }[] = [
  { key: 'make', label: 'Make file' },
  { key: 'share', label: 'Share' },
  { key: 'done', label: 'Done' },
];

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 28 },
  // step indicator (S2): label over a 28 circle, circles joined by 2 px lines
  stepLabels: { flexDirection: 'row' },
  stepLabel: { ...type.sub, flex: 1, textAlign: 'center' },
  stepTrack: { flexDirection: 'row', height: 28, marginTop: 8 },
  stepLine: { position: 'absolute', top: 13, height: 2, width: '33.34%' },
  stepCol: { flex: 1, alignItems: 'center' },
  stepCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: t.ground },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.ink },
  // journey (U1): phone → file → HQ, on the ground
  journey: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 24, paddingHorizontal: 2 },
  node: { width: 88, alignItems: 'center' },
  disc: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: t.track },
  discNow: { backgroundColor: t.card, borderWidth: 2, borderColor: t.ink },
  discDone: { backgroundColor: t.onTint, borderWidth: 2, borderColor: t.onFill },
  discOff: { borderStyle: 'dashed', borderColor: t.track },
  badge: { position: 'absolute', right: -5, bottom: -5, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.ground },
  nodeTitle: { ...type.title, color: t.ink, textAlign: 'center', marginTop: 9 },
  nodeSub: { ...type.small, fontWeight: '400', color: t.ink2, textAlign: 'center' },
  arrow: { paddingTop: 23 },
  // compact journey (Share and Done): smaller discs and one-line labels so the routes show without scrolling
  journeySm: { marginTop: 10 },
  nodeSm: { width: 96 },
  discSm: { width: 52, height: 52, borderRadius: 26 },
  badgeSm: { right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11 },
  nodeLabelSm: { ...type.label, color: t.ink, textAlign: 'center', marginTop: 6 },
  arrowSm: { paddingTop: 15 },
  // the S2 file card, centred
  fileCard: { backgroundColor: t.card, borderRadius: radius.card, alignItems: 'center', paddingTop: 18, paddingBottom: 16, paddingHorizontal: 18 },
  zipTile: { width: 72, height: 72, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  fileName: { ...type.title, color: t.ink, textAlign: 'center' },
  fileSize: { ...type.sub, color: t.ink2, marginTop: 4 },
  fileCounts: { ...type.sub, color: t.ink, marginTop: 2, textAlign: 'center' },
  fileNote: { ...type.small, fontWeight: '400', color: t.ink2, textAlign: 'center', marginTop: 4 },
  // routes (U1): each in its own white card in the grey tray
  route: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 12, paddingRight: 10, borderRadius: radius.card, backgroundColor: t.card },
  routeTile: { width: 44, height: 44, borderRadius: radius.tile, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  routeTitle: { ...type.title, color: t.ink },
  routeMeta: { alignItems: 'flex-start', gap: 4, marginTop: 4 },
  routeSub: { ...type.small, fontWeight: '400', color: t.ink2 },
  tag: { minHeight: 24, paddingHorizontal: 8, borderRadius: radius.tag, justifyContent: 'center' },
  tagText: { ...type.small, fontWeight: '600' },
  safe: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.card, backgroundColor: t.card },
  safeText: { ...type.body, color: t.ink, flex: 1 },
  // the offline card (U1 right): pink tint, red title, dark body, stretched buttons
  off: { backgroundColor: t.offTint, borderRadius: radius.card, paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16, gap: 12, alignItems: 'stretch' },
  offHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  offTitle: { ...type.head, color: t.offTintInk, flex: 1 },
  offBody: { fontSize: 17, lineHeight: 24, fontWeight: '400', color: t.ink },
  // lists (Other things, history, What changed)
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 12 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 54 },
  tile: { width: 30, height: 30, borderRadius: radius.tile, backgroundColor: t.tile, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...type.body, color: t.ink },
  rowSub: { ...type.sub, color: t.ink2 },
  err: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 20, paddingTop: 11, paddingHorizontal: 14, paddingBottom: 12, borderRadius: radius.card, backgroundColor: t.offTint },
  errText: { ...type.sub, lineHeight: 20, color: t.offTintInk },
  errFile: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  errFileText: { ...type.small, fontWeight: '400', color: t.offTintInk, flexShrink: 1 },
  doneCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: t.onFill, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 },
  doneText: { ...type.sub, lineHeight: 20, color: t.onInk, flex: 1 },
}));

/** A zipped file (the bundle), in the kit's 24-grid stroke. */
function Zip({ color, size = 26, strokeWidth = 1.75 }: { color: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <Path d="M14 3.5V8h4.5" />
      <Path d="M11 5.5h1M11 7.5h1M11 9.5h1M11 11.5h1" />
      <Rect x={10.25} y={13} width={2.5} height={3.5} rx={0.8} />
    </Svg>
  );
}

/** A laptop, drawn in the kit's 24-grid stroke (the sprite has no laptop). */
function Laptop({ color, size = 26, strokeWidth = 1.75 }: { color: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4.5} y={5.5} width={15} height={10} rx={1.5} />
      <Path d="M2.5 18.5h19" />
    </Svg>
  );
}

/** The journey arrow; dashed when the file can't travel that leg yet. */
function Arrow({ color, dashed, size = 26 }: { color: string; dashed?: boolean; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4.5 12h14" strokeDasharray={dashed ? '2.5 2.5' : undefined} strokeLinecap={dashed ? 'butt' : 'round'} />
      <Path d="M13.5 6l6 6-6 6" />
    </Svg>
  );
}

export default function Handover() {
  const field = useField();
  const s = useStyles();
  const { t } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const [made, setMade] = useState<MadeBundle | null>(null);
  const [stage, setStage] = useState<Stage>('make');
  const [received, setReceived] = useState<ReceiveResult | null>(null);
  const [error, setError] = useState<{ message: string; file?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [offlineEmail, setOfflineEmail] = useState(false);
  const [plan, setPlan] = useState(() => planBundle('unconfirmed'));

  const toTop = () => scroll.current?.scrollTo({ y: 0, animated: true });

  async function make(scope: Scope) {
    setBusy(true);
    setError(null);
    setReceived(null);
    setOfflineEmail(false);
    try {
      const b = await makeFieldBundle(field, scope);
      setMade(b);
      setStage('share');
      toTop();
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
    toTop();
  }

  async function pickRoute(r: Route) {
    if (r === 'email') {
      const now = await checkOnline();
      setOnline(now);
      if (!now) {
        setOfflineEmail(true); // say so plainly before the share sheet, never after a silent failure
        toTop(); // so the journey shows the file safe here and HQ waiting
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
    .slice(0, 2);

  const tile = (icon: IconName) => (
    <View style={s.tile}>
      <Icon name={icon} size={18} color={t.ink} strokeWidth={2} />
    </View>
  );

  // ---- the step indicator: Make file · Share · Done (done = mint + tick, current = ink ring + dot) ----
  const at = STEPS.findIndex((x) => x.key === stage);
  const stepDone = (i: number) => i < at || stage === 'done';
  const steps = (
    <View accessible accessibilityLabel={`Step ${at + 1} of 3: ${STEPS[at].label}`}>
      <View style={s.stepLabels}>
        {STEPS.map((x, i) => (
          <Text key={x.key} style={[s.stepLabel, i === at ? { color: t.ink, fontWeight: '600' } : { color: t.ink2 }]}>
            {x.label}
          </Text>
        ))}
      </View>
      <View style={s.stepTrack}>
        <View style={[s.stepLine, { left: '16.66%', backgroundColor: stepDone(0) ? t.onMark : t.track }]} />
        <View style={[s.stepLine, { left: '50%', backgroundColor: stepDone(1) ? t.onMark : t.track }]} />
        {STEPS.map((x, i) => (
          <View key={x.key} style={s.stepCol}>
            {stepDone(i) ? (
              <View style={[s.stepCircle, { backgroundColor: t.onMark, borderColor: t.onMark }]}>
                <Icon name="check" size={16} color={t.onGlyph} strokeWidth={3} />
              </View>
            ) : i === at ? (
              <View style={[s.stepCircle, { borderColor: t.ink }]}>
                <View style={s.stepDot} />
              </View>
            ) : (
              <View style={[s.stepCircle, { borderColor: t.track }]} />
            )}
          </View>
        ))}
      </View>
    </View>
  );

  // ---- the journey picture: phone → file → HQ ----
  const confirmed = !!received?.changes.some((c) => c.startsWith('HQ confirmed'));
  // Full size on Make and in the offline story; compact once the file is made and the routes matter.
  const compact = (stage === 'share' && !offlineEmail) || stage === 'done';
  const node = (title: string, sub: string | null, art: (color: string, size: number) => ReactNode, state: NodeState) => {
    const grey = state === 'off';
    const label = !sub ? title : sub === 'laptop' ? 'HQ laptop' : `${title} · ${sub}`;
    return (
      <View style={[s.node, compact && s.nodeSm]}>
        <View style={[s.disc, compact && s.discSm, state === 'now' && s.discNow, state === 'done' && s.discDone, grey && s.discOff]}>
          {art(grey ? t.ink2 : t.ink, compact ? 28 : 40)}
          {state === 'done' && (
            <View style={[s.badge, compact && s.badgeSm, { backgroundColor: t.onMark }]}>
              <Icon name="check" size={compact ? 13 : 15} color={t.onGlyph} strokeWidth={3} />
            </View>
          )}
          {(state === 'wait' || grey) && (
            <View style={[s.badge, compact && s.badgeSm, { backgroundColor: grey ? t.group : t.nearFill }]}>
              <Icon name="clock" size={compact ? 15 : 17} color={grey ? t.ink2 : t.nearInk} strokeWidth={2.25} />
            </View>
          )}
        </View>
        {compact ? (
          <Text style={s.nodeLabelSm} numberOfLines={1}>
            {label}
          </Text>
        ) : (
          <>
            <Text style={[s.nodeTitle, grey && { color: t.ink2 }]}>{title}</Text>
            {sub && <Text style={s.nodeSub}>{sub}</Text>}
          </>
        )}
      </View>
    );
  };
  const phoneState: NodeState = stage === 'make' ? 'now' : 'done';
  const fileState: NodeState = stage === 'make' ? 'idle' : stage === 'share' && !offlineEmail ? 'now' : 'done';
  const hqState: NodeState = confirmed ? 'done' : offlineEmail ? 'off' : stage === 'done' ? 'wait' : 'idle';
  const hqSub = hqState === 'done' ? 'confirmed' : hqState === 'off' ? 'not yet' : hqState === 'wait' ? 'waiting' : 'laptop';
  const journeySay =
    hqState === 'off'
      ? 'The file is made and safe on this phone. HQ cannot get it by email until you are online.'
      : stage === 'make'
        ? 'Next: make the file.'
        : stage === 'share'
          ? 'The file is made. Next: share it.'
          : 'Shared. HQ has not confirmed it yet.';
  const journey = (
    <View style={[s.journey, compact && s.journeySm]} accessible accessibilityLabel={`This phone, then the file, then HQ. ${journeySay}`}>
      {node('Phone', null, (c, z) => <Icon name="phone" size={z} color={c} strokeWidth={1.5} />, phoneState)}
      <View style={compact ? s.arrowSm : s.arrow}>
        <Arrow color={t.ink2} size={compact ? 22 : 26} />
      </View>
      {node('File', made ? kb(made.bytes) : '.zip', (c, z) => <Zip color={c} size={z} strokeWidth={1.5} />, fileState)}
      <View style={compact ? s.arrowSm : s.arrow}>
        <Arrow color={t.ink2} size={compact ? 22 : 26} dashed={hqState === 'off'} />
      </View>
      {node('HQ', hqSub, (c, z) => <Laptop color={c} size={z} strokeWidth={1.5} />, hqState)}
    </View>
  );

  // ---- routes: each its own card, tag under the title ----
  const routeTag = (kind: 'ok' | 'net') => (
    <View style={[s.tag, { backgroundColor: kind === 'ok' ? t.onFill : t.nearFill }]}>
      <Text style={[s.tagText, { color: kind === 'ok' ? t.onInk : t.nearInk }]}>{kind === 'ok' ? 'Works now' : 'Needs internet'}</Text>
    </View>
  );
  const routeCard = (r: Route, icon: IconName, title: string, sub: string, kind: 'ok' | 'net') => (
    <Pressable
      key={r}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${kind === 'ok' ? 'Works now' : 'Needs internet'}. ${sub}`}
      onPress={() => pickRoute(r)}
      style={({ pressed }) => [s.route, pressed && { backgroundColor: t.secPress }]}
    >
      <View style={s.routeTile}>
        <Icon name={icon} size={24} color={t.ink} strokeWidth={1.75} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.routeTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={s.routeMeta}>
          {routeTag(kind)}
          <Text style={s.routeSub}>{sub}</Text>
        </View>
      </View>
      <Icon name="chev" size={18} color={t.ink2} />
    </Pressable>
  );
  const emailSub = online === false ? 'No internet here now' : online ? 'Online now' : 'Waits in the Outbox until online';

  return (
    <View style={s.wrap}>
      <ScrollView ref={scroll} contentContainerStyle={s.page}>
        {steps}
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

        {/* Make: the file this will make (S2 card, "will make" state) */}
        {stage === 'make' && (
          <Group style={{ marginTop: 22 }}>
            <View style={s.fileCard}>
              <View style={[s.zipTile, { backgroundColor: t.tile, opacity: 0.7 }]}>
                <Zip color={t.ink2} size={40} strokeWidth={1.5} />
              </View>
              <Text style={s.fileName}>
                {countsLine({ surveys: plan.surveys.length, encounters: plan.encounters.length, photos: plan.photos.length })}
              </Text>
              <Text style={s.fileNote}>{'Plus form changes and requests\nSending again is safe'}</Text>
            </View>
          </Group>
        )}

        {/* Share / Done: the file made (S2 card) */}
        {stage !== 'make' && made && !offlineEmail && (
          <Group style={{ marginTop: 12 }}>
            <View style={s.fileCard} accessible accessibilityLabel={`File made: ${made.fileName}, ${kb(made.bytes)}, ${countsLine(made.counts)}`}>
              <View style={[s.zipTile, { backgroundColor: t.onTint }]}>
                <Zip color={t.ink} size={40} strokeWidth={1.5} />
              </View>
              <Text style={s.fileName} numberOfLines={2}>
                {made.fileName.replace(/_(?=\d{8})/, '_\u200B') /* break before the date, never inside the team name */}
              </Text>
              <Text style={s.fileSize}>{kb(made.bytes)}</Text>
              <Text style={s.fileCounts}>{countsLine(made.counts)}</Text>
              {made.counts.problems.map((p) => (
                <Text key={p} style={s.fileNote}>
                  {p}
                </Text>
              ))}
            </View>
          </Group>
        )}

        {stage === 'share' && made && !offlineEmail && (
          <>
            <Group style={{ marginTop: 10 }}>
              <TrayTitle>Choose how the file travels to HQ</TrayTitle>
              {routeCard('nearby', 'nearby', NEARBY, 'Works offline, phones side by side', 'ok')}
              {routeCard('cable', 'cable', 'Cable or Files', 'Works offline, plug into HQ laptop', 'ok')}
              {routeCard('email', 'mail', 'Email (Gmail)', emailSub, 'net')}
            </Group>
            <Group style={{ marginTop: 10 }}>
              <View style={s.safe}>
                <Icon name="shield" size={24} color={t.onMark} strokeWidth={1.75} />
                <Text style={s.safeText}>Nothing is deleted from this phone</Text>
              </View>
            </Group>
          </>
        )}

        {/* Email with no internet: say so before the share sheet (U1 right) */}
        {stage === 'share' && made && offlineEmail && (
          <>
            <Group style={{ marginTop: 22 }}>
              <View style={s.off} accessibilityRole="alert">
                <View style={s.offHead}>
                  <Icon name="warning" size={34} color={t.offTintInk} strokeWidth={1.75} />
                  <Text style={s.offTitle}>This won't reach HQ yet</Text>
                </View>
                <Text style={s.offBody}>
                  You're offline and chose email. The file is safe on this phone. Use {NEARBY} or a cable now, or pick Gmail and it waits in the
                  Outbox until you reconnect.
                </Text>
                <View style={{ gap: 10, marginTop: 4 }}>
                  <Button label={`Use ${NEARBY} instead`} size={56} onPress={share} />
                  <Button label="Keep it in the Outbox" kind="white" size={56} onPress={share} />
                </View>
              </View>
            </Group>
            <Button kind="link" label="Back to the routes" onPress={() => setOfflineEmail(false)} style={{ marginTop: 6 }} />
          </>
        )}

        {stage === 'done' && made && (
          <Group style={{ marginTop: 10, gap: 6 }}>
            <View style={s.doneCard}>
              <Icon name="check" size={20} color={t.onInk} strokeWidth={2.5} />
              <Text style={s.doneText}>
                When HQ has imported it, they send a file back: open it with Receive from HQ and the counter on Home goes down. If it didn't go,
                share it again.
              </Text>
            </View>
            <Button label="Share it again" kind="white" size={48} onPress={() => setStage('share')} />
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
                      {tile(/correction/.test(c) ? 'inbox' : 'check')}
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

        {stage === 'make' && (
          <>
            <GroupTitle>Other things</GroupTitle>
            <Group>
              <View style={s.list}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={receive} style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }, busy && { opacity: 0.6 }]}>
                  {tile('download')}
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>Receive from HQ</Text>
                    <Text style={s.rowSub}>Open the file HQ sent back</Text>
                  </View>
                  <Icon name="chev" size={18} color={t.ink2} />
                </Pressable>
                <View style={s.sep} />
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => make('full')} style={({ pressed }) => [s.row, pressed && { backgroundColor: t.secPress }, busy && { opacity: 0.6 }]}>
                  {tile('phone')}
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>Back up this phone</Text>
                    <Text style={s.rowSub}>
                      Everything: {plural(counter.totalRecords, 'record', 'records')}, {plural(counter.totalPhotos, 'photo', 'photos')}
                    </Text>
                  </View>
                  <Icon name="chev" size={18} color={t.ink2} />
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
          </>
        )}
      </ScrollView>

      {!offlineEmail && (
        <BottomBar>
          {stage === 'make' && <Button label={busy ? 'Making the file…' : 'Send to HQ'} size={64} onPress={() => make('unconfirmed')} disabled={busy} />}
          {stage === 'share' && <Button label="Share the file" size={64} onPress={share} />}
          {stage === 'done' && <Button label="Done" size={64} onPress={() => router.back()} />}
        </BottomBar>
      )}
    </View>
  );
}
