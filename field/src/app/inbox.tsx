// P10 · Corrections from HQ. Each was approved by a person at HQ (even when the AI drafted it); the surveyor
// still decides. Accepting makes a new version of the record; the old one is kept.
// Kit: the "Did you mean?" anatomy on a grey group (title + source tag, what, a white body with the record's
// label, where it was seen and the old → new change with the cut digits marked, a mint effect line), the
// approval line, "Note (optional)", Accept (black) / Decline (white). Answered cards fold into "Answered".
import type { SpeciesPack, Template } from '@sciworks/shared';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { TextBox } from '@/components/fields';
import { BandMarker, Icon } from '@/components/Icon';
import { Button, Group, GroupTitle, Hint, T } from '@/components/ui';
import { clockOf, nowIso } from '@/lib/time';
import { useField } from '@/state/field';
import { acceptCorrection, declineCorrection, inbox, showValue, type InboxItem } from '@/sync/corrections';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The field's short label: "Snout–vent length (SVL)" → "SVL", else the label, else the path. */
function fieldLabel(template: Template | null, path: string): string {
  const f = template?.fields.find((x) => x.path === path);
  if (!f) return path;
  return /\(([^)]+)\)\s*$/.exec(f.label)?.[1] ?? f.label;
}

const measure = (v: unknown) =>
  v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'number' && typeof (v as { unit?: unknown }).unit === 'string'
    ? (v as { value: number; unit: string })
    : null;

/** Which digits changed between two whole numbers, for the red-tint / mint marks. */
function digitDiff(a: number, b: number) {
  const x = String(Math.round(a));
  const y = String(Math.round(b));
  let p = 0;
  while (p < x.length && p < y.length && x[p] === y[p]) p++;
  let q = 0;
  while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++;
  return { oldFrom: p, oldTo: x.length - q, newFrom: p, newTo: y.length - q };
}

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48 },
  lead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, marginHorizontal: 6, marginBottom: 10 },
  leadText: { ...type.small, fontWeight: '400', lineHeight: 17, color: t.ink2, flex: 1 },
  dym: { backgroundColor: t.group, borderRadius: radius.group, paddingTop: 11, paddingHorizontal: 8, paddingBottom: 8, marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 6 },
  src: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.card, borderRadius: radius.tag, height: 26, paddingLeft: 7, paddingRight: 9 },
  srcText: { ...type.small, fontWeight: '600', color: t.ink2 },
  what: { ...type.sub, color: t.ink2, paddingTop: 4, paddingHorizontal: 6 },
  body: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden', marginTop: 10 },
  lbl: { ...type.small, fontWeight: '600', color: t.ink2, paddingTop: 10, paddingHorizontal: 14 },
  ctx: { ...type.small, fontWeight: '400', color: t.ink2, paddingTop: 1, paddingHorizontal: 14 },
  change: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 10, rowGap: 4, paddingTop: 8, paddingHorizontal: 14, paddingBottom: 7 },
  old: { fontSize: 20, color: t.ink2, fontVariant: ['tabular-nums'] },
  neu: { ...type.numeral, color: t.ink },
  unit: { fontSize: 13, fontWeight: '500', color: t.ink2 },
  cut: { backgroundColor: t.offTint, color: t.offTintInk, textDecorationLine: 'line-through' },
  add: { backgroundColor: t.onFill, color: t.onInk },
  effect: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: t.onFill },
  effectText: { ...type.sub, fontWeight: '500', color: t.onInk, flex: 1 },
  fine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, paddingHorizontal: 6, paddingBottom: 6 },
  fineText: { ...type.small, fontWeight: '400', color: t.ink2, flex: 1 },
  label: { ...type.label, color: t.ink, marginTop: 12, marginHorizontal: 6, marginBottom: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  done: { backgroundColor: t.group, borderRadius: radius.group, flexDirection: 'row', gap: 12, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 12, marginBottom: 10 },
  doneTitle: { ...type.title, color: t.ink },
  doneText: { ...type.sub, color: t.ink2, marginTop: 2 },
  doneBy: { ...type.small, fontWeight: '400', color: t.ink2, marginTop: 5 },
  empty: { backgroundColor: t.card, borderRadius: radius.card, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center' },
}));

export default function Inbox() {
  const field = useField();
  const { person, project, transects, template, pack } = field;
  const s = useStyles();
  const { t } = useTheme();
  const [items, setItems] = useState(inbox);
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!person) return <T>Choose a person first.</T>;
  const ctx = () => ({ personId: person.personId, at: nowIso(project?.timeZone), project, transects });
  const done = () => {
    setItems(inbox());
    field.refresh();
  };
  const who = (code: string) => project?.people.find((p) => p.personId === code)?.name ?? code;

  const mine = items.filter((i) => i.record);
  const elsewhere = items.length - mine.length;
  const open = mine.filter((i) => !i.response);
  const answered = mine.filter((i) => i.response);

  const nameOf = (i: InboxItem) =>
    i.record?.recordType === 'encounter' ? (i.record.taxon.scientificName ?? null) : null;
  const titleLine = (i: InboxItem) => {
    const name = nameOf(i);
    const what = fieldLabel(template, i.request.fieldPath);
    return (
      <>
        {name ? <Text style={{ fontStyle: 'italic' }}>{name}</Text> : i.record?.recordType === 'survey' ? 'Survey' : 'Animal'} · {what}
      </>
    );
  };
  const whereLine = (i: InboxItem) => {
    const r = i.record;
    if (!r) return '';
    if (r.recordType === 'encounter') {
      return [r.transectId, clockOf(r.observedAt), r.distanceAlongM ? `${thousands(r.distanceAlongM.value)} m along` : null].filter(Boolean).join(' · ');
    }
    return [r.transectId, clockOf(r.startedAt)].filter(Boolean).join(' · ');
  };
  const byLine = (i: InboxItem) =>
    i.request.source === 'ai-agent' ? `Suggested by the AI reviewer, approved by ${who(i.request.approvedBy)}` : `Sent by ${who(i.request.approvedBy)} at HQ`;

  /** "435 mm is inside this pack's range (max 646 mm)." when the pack has a range for this field. */
  const effectLine = (i: InboxItem) => {
    const now = measure(i.request.proposed);
    const r = i.record;
    if (!now || !pack || r?.recordType !== 'encounter' || !r.taxon.taxonId) return null;
    const taxon = (pack as SpeciesPack).taxa.find((x) => x.taxonId === r.taxon.taxonId);
    const trait = taxon?.traits.find((x) => x.trait === i.request.fieldPath && 'range' in x && x.range) as { range: { min?: number; max?: number } } | undefined;
    const max = trait?.range.max;
    const min = trait?.range.min;
    if (max === undefined) return null;
    const inside = now.value <= max && (min === undefined || now.value >= min);
    if (!inside) return null;
    return `${thousands(now.value)} ${now.unit} is inside this pack's range (max ${thousands(max)} ${now.unit}).`;
  };

  /** Old → new, with the cut digits in red tint and the added ones in mint (numbers); plain words otherwise. */
  const change = (i: InboxItem) => {
    const a = measure(i.request.current);
    const b = measure(i.request.proposed);
    if (a && b && Number.isInteger(a.value) && Number.isInteger(b.value)) {
      const d = digitDiff(a.value, b.value);
      const mark = (n: number, from: number, to: number, style: object) => {
        const digits = String(n);
        const out: React.ReactNode[] = [];
        let seen = 0;
        thousands(n)
          .split('')
          .forEach((ch, k) => {
            if (ch === ',') return out.push(ch);
            const on = seen >= from && seen < to;
            seen++;
            out.push(on ? <Text key={k} style={style}>{ch}</Text> : ch);
          });
        void digits;
        return out;
      };
      return (
        <View style={s.change} accessibilityLabel={`${showValue(i.request.current)} to ${showValue(i.request.proposed)}`}>
          <Text style={s.old}>
            {mark(a.value, d.oldFrom, d.oldTo, s.cut)}
            <Text style={s.unit}> {a.unit}</Text>
          </Text>
          <Icon name="arrow" size={18} color={t.ink2} />
          <Text style={s.neu}>
            {mark(b.value, d.newFrom, d.newTo, s.add)}
            <Text style={s.unit}> {b.unit}</Text>
          </Text>
        </View>
      );
    }
    return (
      <View style={s.change}>
        <Text style={[s.old, { fontSize: 17 }]}>{showValue(i.request.current)}</Text>
        <Icon name="arrow" size={18} color={t.ink2} />
        <Text style={[s.neu, { fontSize: 20 }]}>{showValue(i.request.proposed)}</Text>
      </View>
    );
  };

  const card = (i: InboxItem) => {
    const r = i.request;
    const changedSince = i.record && i.record.rev > r.rev;
    const effect = effectLine(i);
    return (
      <View key={r.correctionId} style={s.dym} accessibilityLabel="Did you mean? Correction from HQ">
        <View style={s.head}>
          <T v="headBold">Did you mean?</T>
          <View style={s.src}>
            <Icon name={r.source === 'ai-agent' ? 'reviewer' : 'user'} size={15} color={t.ink2} />
            <Text style={s.srcText}>{r.source === 'ai-agent' ? 'AI reviewer' : 'Data Manager'}</Text>
          </View>
        </View>
        <Text style={s.what}>{r.reason}</Text>
        {changedSince && (
          <View style={{ marginTop: 10 }}>
            <Hint>
              This record was changed on the phone after HQ looked at it (version {r.rev} → {i.record!.rev}).
            </Hint>
          </View>
        )}
        <View style={s.body}>
          <Text style={s.lbl}>{titleLine(i)}</Text>
          <Text style={s.ctx}>{whereLine(i)}</Text>
          {change(i)}
          {effect && (
            <View style={s.effect}>
              <View style={{ marginTop: 3 }}>
                <BandMarker band="green" size={14} />
              </View>
              <Text style={s.effectText}>{effect}</Text>
            </View>
          )}
        </View>
        <View style={s.fine}>
          <Icon name="user" size={15} color={t.ink2} />
          <Text style={s.fineText}>{byLine(i)}</Text>
        </View>
        <Text style={s.label}>Note (optional)</Text>
        <TextBox
          multiline
          placeholder="e.g. the animal really was that size"
          value={notes[r.correctionId]}
          onChange={(v) => setNotes({ ...notes, [r.correctionId]: v ?? '' })}
        />
        <View style={s.actions}>
          <Button
            label="Accept"
            size={64}
            style={{ flex: 1 }}
            onPress={() => {
              acceptCorrection(i, ctx());
              done();
            }}
          />
          <Button
            label="Decline"
            kind="white"
            size={64}
            style={{ flex: 1 }}
            onPress={() => {
              declineCorrection(i, ctx(), notes[r.correctionId]);
              done();
            }}
          />
        </View>
      </View>
    );
  };

  const folded = (i: InboxItem) => {
    const res = i.response!;
    const accepted = res.decision === 'accepted';
    return (
      <View key={i.request.correctionId} style={s.done}>
        <View style={{ marginTop: 1 }}>{accepted ? <BandMarker band="green" size={24} /> : <Icon name="clear" size={24} color={t.ink2} strokeWidth={2} />}</View>
        <View style={{ flex: 1 }}>
          <Text style={s.doneTitle}>
            {accepted ? `Accepted (saved as version ${res.newRev})` : res.note ? `Declined: ${res.note}` : 'Declined'}
          </Text>
          <Text style={s.doneText}>{titleLine(i)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`${showValue(i.request.current)} to ${showValue(i.request.proposed)}`}>
            <Text style={[s.doneText, { marginTop: 0 }]}>{showValue(i.request.current)}</Text>
            <Icon name="arrow" size={14} color={t.ink2} />
            <Text style={[s.doneText, { marginTop: 0 }]}>{showValue(i.request.proposed)}</Text>
          </View>
          <Text style={s.doneBy}>{byLine(i)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        {mine.length === 0 ? (
          <Group style={{ marginTop: 8 }}>
            <View style={s.empty}>
              <View style={{ marginBottom: 8 }}>
                <Icon name="inbox" size={24} color={t.ink2} />
              </View>
              <T v="title" style={{ textAlign: 'center' }}>
                No corrections for records on this phone.
              </T>
            </View>
          </Group>
        ) : (
          <View style={s.lead}>
            <Icon name="bundle" size={16} color={t.ink2} />
            <Text style={s.leadText}>Your answers go back to HQ in the next bundle.</Text>
          </View>
        )}
        {open.map(card)}
        {answered.length > 0 && <GroupTitle>Answered</GroupTitle>}
        {answered.map(folded)}
        {elsewhere > 0 && (
          <Text style={[s.leadText, { marginTop: 8, marginHorizontal: 6 }]}>
            {elsewhere} more {elsewhere === 1 ? 'is' : 'are'} for records on other phones.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
