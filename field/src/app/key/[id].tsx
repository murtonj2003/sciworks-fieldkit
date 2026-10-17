// P7 · Scale-count key: enter traits in any order, see ranked candidates with the reasons, pick one.
// The counts are saved on the animal as they're typed; the key only ever suggests.
// Kit: the "Check this next" card holds that trait's own input (the one inked card on the screen); the other
// traits sit in one grey group with equal-width chips; Best matches draws the top two as cards with check /
// cross / question lines and counts the rest; the top match's black "Choose …" pill stays in the bottom bar.
// A venomous best match pins a red-tint banner under the app bar (never solid red).
import { TRAIT_LABEL, runKey, type KeyCandidate, type ScaleCounts } from '@sciworks/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Chips, NumberInput, useFieldStyles } from '@/components/fields';
import { Icon } from '@/components/Icon';
import { BottomBar, Button, Group, GroupTitle, Row, SavedMark, T, Tag } from '@/components/ui';
import { useRecord } from '@/hooks/useRecord';
import type { LocalEncounter } from '@/model/records';
import { useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

type NumKey = 'dorsalRowsMidbody' | 'ventrals' | 'subcaudals';
type Trait = { key: keyof ScaleCounts; num?: true; options?: { code: string; label: string }[] };

/** The order the traits are listed in (kit P7). */
const TRAITS: Trait[] = [
  { key: 'dorsalRowsMidbody', num: true },
  { key: 'analPlate', options: [{ code: 'single', label: 'Single' }, { code: 'divided', label: 'Divided' }] },
  { key: 'keeled', options: [{ code: 'smooth', label: 'Smooth' }, { code: 'weak', label: 'Weakly keeled' }, { code: 'keeled', label: 'Keeled' }] },
  { key: 'loreal', options: [{ code: 'present', label: 'Present' }, { code: 'absent', label: 'Absent' }] },
  { key: 'pupil', options: [{ code: 'round', label: 'Round' }, { code: 'vertical', label: 'Vertical' }, { code: 'horizontal', label: 'Horizontal' }] },
  { key: 'ventrals', num: true },
  { key: 'subcaudals', num: true },
];

const cap = (x: string) => x[0]!.toUpperCase() + x.slice(1);
const labelOf = (key: keyof ScaleCounts) => TRAIT_LABEL[key as keyof typeof TRAIT_LABEL] ?? String(key);

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 24 },
  venom: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: t.offTint, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, marginTop: 2, marginHorizontal: 16, marginBottom: 8 },
  venomText: { ...type.sub, lineHeight: 20, color: t.offTintInk, flex: 1 },
  disc: { ...type.small, fontWeight: '400', lineHeight: 18, color: t.ink2, marginTop: 2, marginHorizontal: 4, marginBottom: 12 },
  next: { backgroundColor: t.card, borderRadius: radius.card, padding: 14, borderWidth: 2, borderColor: t.ink },
  nextHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 30, height: 30, borderRadius: radius.tile, backgroundColor: t.pri, alignItems: 'center', justifyContent: 'center' },
  nextTitle: { ...type.headBold, color: t.ink, flex: 1 },
  traits: { paddingTop: 4, paddingHorizontal: 8, paddingBottom: 10, marginTop: 10 },
  label: { ...type.label, color: t.ink, marginTop: 14, marginBottom: 8, marginHorizontal: 4 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, marginHorizontal: 4 },
  noteText: { ...type.small, fontWeight: '400', lineHeight: 17, color: t.ink2, flex: 1 },
  cand: { backgroundColor: t.card, borderRadius: radius.card, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 13 },
  candName: { ...type.head, color: t.ink },
  counts: { ...type.sub, color: t.ink2, marginTop: 3 },
  why: { marginTop: 10, gap: 7 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lineText: { ...type.sub, lineHeight: 20, color: t.ink, flex: 1 },
  more: { ...type.small, fontWeight: '400', lineHeight: 18, color: t.ink2, marginTop: 12, marginHorizontal: 6 },
}));

export default function KeyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pack } = useField();
  const { record: e, update } = useRecord<LocalEncounter>(id);
  const s = useStyles();
  const fs = useFieldStyles();
  const { t } = useTheme();
  // While a count is being typed in the "Check this next" card it stays there, so the box doesn't jump away
  // after the first digit; it moves on when the keyboard closes.
  const [held, setHeld] = useState<keyof ScaleCounts | null>(null);
  const counts = e?.scaleCounts ?? {};
  const result = useMemo(
    () => (pack && e ? runKey({ ...counts, sex: e.sex, tailCondition: e.tailCondition }, pack) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pack, e?.scaleCounts, e?.sex, e?.tailCondition],
  );
  if (!e || !pack || !result) return <T>Load a project first.</T>;

  const set = (key: keyof ScaleCounts, value: unknown) =>
    update((r) => {
      const next = { ...(r.scaleCounts ?? {}) } as Record<string, unknown>;
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...r, scaleCounts: next as ScaleCounts };
    });

  const choose = (c: KeyCandidate) => {
    update((r) => ({ ...r, taxon: { taxonId: c.taxonId, scientificName: c.scientificName, idBasis: 'scale-key', keyRun: result } }));
    router.back();
  };

  const tailOk = e.tailCondition === 'intact';
  const nextKey = held ?? result.checkNext ?? null;
  const nextTrait = TRAITS.find((x) => x.key === nextKey);
  const shown = result.candidates.slice(0, 2);
  const best = shown[0];

  /** One trait's own control: the number box with the keypad, or its chips. */
  const control = (x: Trait, inCard: boolean) =>
    x.num ? (
      <NumberInput
        integer
        value={counts[x.key as NumKey]}
        onChange={(v) => {
          if (inCard) setHeld(x.key);
          set(x.key, v);
        }}
        onBlur={inCard ? () => setHeld(null) : undefined}
        accessibilityLabel={labelOf(x.key)}
        boxStyle={inCard ? { backgroundColor: t.group } : undefined}
      />
    ) : (
      <Chips grid onGround={inCard} options={x.options!} value={counts[x.key] as string | undefined} onChange={(v) => set(x.key, v)} />
    );

  const tailNote = (x: Trait) =>
    x.key === 'subcaudals' && !tailOk ? (
      <View style={s.note}>
        <Icon name="info" size={16} color={t.ink2} />
        <Text style={s.noteText}>
          Ignored by the key: the tail is {e.tailCondition ?? 'not marked intact'}. The count is still saved.
        </Text>
      </View>
    ) : null;

  const reasonLine = (icon: 'check' | 'cross' | 'question', text: string, color: string) => (
    <View key={icon + text} style={s.line}>
      <View style={{ marginTop: 1 }}>
        <Icon name={icon} size={18} color={color} strokeWidth={2.25} />
      </View>
      <Text style={s.lineText}>{text}</Text>
    </View>
  );

  return (
    <View style={s.wrap}>
      <Stack.Screen options={{ title: 'Scale-count key', headerRight: () => <SavedMark /> }} />
      {best?.dangerous && best.score >= 0.8 && (
        <View style={s.venom} accessibilityRole="alert">
          <Icon name="warning" size={22} color={t.offTintInk} strokeWidth={2} />
          <Text style={s.venomText}>
            Best match is <Text style={{ fontWeight: '800', letterSpacing: 0.9 }}>VENOMOUS</Text>:{' '}
            <Text style={{ fontStyle: 'italic' }}>{best.scientificName}</Text>. Follow the handling protocol.
          </Text>
        </View>
      )}
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Text style={s.disc}>
          {pack.disclaimer.split('.')[0]}. Sex: {e.sex}. Tail: {e.tailCondition ?? 'not set'}. Enter what you can see, in any order.
        </Text>

        {nextTrait && (
          <Group>
            <View style={[s.next, t.name === 'night' && { borderColor: t.ink2 }]} accessibilityLabel="Check this next">
              <View style={s.nextHead}>
                <View style={s.tile}>
                  <Icon name="key" size={18} color={t.onPri} />
                </View>
                <Text style={s.nextTitle}>Check this next: {labelOf(nextTrait.key)}</Text>
              </View>
              <View style={{ marginTop: 12 }}>{control(nextTrait, true)}</View>
              {tailNote(nextTrait)}
            </View>
          </Group>
        )}

        <Group style={s.traits}>
          {TRAITS.filter((x) => x.key !== nextTrait?.key).map((x) => (
            <View key={x.key}>
              <Text style={s.label}>{cap(labelOf(x.key))}</Text>
              {control(x, false)}
              {tailNote(x)}
            </View>
          ))}
        </Group>

        {shown.length > 0 && <GroupTitle>Best matches</GroupTitle>}
        {shown.map((c, i) => (
          <Group key={c.taxonId} style={i > 0 ? { marginTop: 10, gap: 6 } : undefined}>
            <View style={s.cand}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 4 }}>
                <Text style={s.candName}>
                  {i + 1}. <Text style={{ fontStyle: 'italic' }}>{c.scientificName}</Text>
                </Text>
                {c.dangerous && <Tag label="VENOMOUS" venomous />}
              </View>
              {i === 0 && (
                <Text style={s.counts}>
                  {c.matched.length} match · {c.conflicts.length} conflict · {c.unknown.length} no data{'\n'}
                  <Text style={{ color: t.ink, fontWeight: '600' }}>score {Math.round(c.score * 100)}%</Text>
                </Text>
              )}
              <View style={s.why}>
                {c.matched.map((m) => reasonLine('check', m, t.onMark))}
                {c.conflicts.map((m) => reasonLine('cross', m, t.offMark))}
                {c.unknown.map((m) => reasonLine('question', m, t.ink2))}
              </View>
            </View>
            {i > 0 && <Button label="Choose this species" kind="white" size={56} onPress={() => choose(c)} />}
          </Group>
        ))}
        {result.candidates.length > shown.length && (
          <Text style={s.more}>{result.candidates.length - shown.length} more not ruled out. Enter another trait to narrow it down.</Text>
        )}
        {shown.length === 0 && (
          <Row style={{ marginTop: 14 }}>
            <T v="sub" dim>
              Nothing in the pack fits these traits. Check the counts, or choose Unidentified + photo.
            </T>
          </Row>
        )}
      </ScrollView>

      {best && (
        <BottomBar>
          <Button
            size={64}
            label={
              <>
                Choose <Text style={{ fontStyle: 'italic' }}>{best.scientificName}</Text>
              </>
            }
            onPress={() => choose(best)}
          />
        </BottomBar>
      )}
    </View>
  );
}
