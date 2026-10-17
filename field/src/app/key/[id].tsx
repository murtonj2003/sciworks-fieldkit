// P7 · Scale-count key: enter traits in any order, see ranked candidates with the reasons, pick one.
// The counts are saved on the animal as they're typed; the key only ever suggests.
// Kit: "Check this next" card first, traits in a grey group, Best matches cards with check / cross / question
// lines and "Choose this species"; a venomous best match pins a red-tint banner (never solid red).
import { TRAIT_LABEL, runKey, type KeyCandidate, type ScaleCounts } from '@sciworks/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Chips, NumberInput, useFieldStyles } from '@/components/fields';
import { Icon } from '@/components/Icon';
import { Button, Group, GroupTitle, Row, SavedMark, T, Tag } from '@/components/ui';
import { useRecord } from '@/hooks/useRecord';
import type { LocalEncounter } from '@/model/records';
import { useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const CATS: { key: keyof ScaleCounts; options: { code: string; label: string }[] }[] = [
  { key: 'analPlate', options: [{ code: 'single', label: 'Single' }, { code: 'divided', label: 'Divided' }] },
  { key: 'keeled', options: [{ code: 'smooth', label: 'Smooth' }, { code: 'weak', label: 'Weakly keeled' }, { code: 'keeled', label: 'Keeled' }] },
  { key: 'loreal', options: [{ code: 'present', label: 'Present' }, { code: 'absent', label: 'Absent' }] },
  { key: 'pupil', options: [{ code: 'round', label: 'Round' }, { code: 'vertical', label: 'Vertical' }, { code: 'horizontal', label: 'Horizontal' }] },
];

const cap = (x: string) => x[0]!.toUpperCase() + x.slice(1);

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 10 },
  venom: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, backgroundColor: t.offTint, paddingVertical: 10, paddingHorizontal: 16 },
  venomText: { ...type.sub, fontWeight: '600', color: t.offTintInk, flexShrink: 1 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 },
  cand: { backgroundColor: t.card, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  candHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  lineText: { ...type.sub, color: t.ink, flex: 1 },
}));

export default function KeyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pack } = useField();
  const { record: e, update } = useRecord<LocalEncounter>(id);
  const s = useStyles();
  const fs = useFieldStyles();
  const { t } = useTheme();
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
  const shown = result.candidates.slice(0, 6);
  const best = shown[0];
  const numberRow = (key: 'dorsalRowsMidbody' | 'ventrals' | 'subcaudals') => (
    <View style={fs.field} key={key}>
      <Text style={[fs.label, { marginHorizontal: 4 }]}>{cap(TRAIT_LABEL[key])}</Text>
      <NumberInput integer value={counts[key]} onChange={(v) => set(key, v)} accessibilityLabel={TRAIT_LABEL[key]} />
      {key === 'subcaudals' && !tailOk && (
        <Text style={fs.help}>Ignored by the key: the tail is {e.tailCondition ?? 'not marked intact'}. The count is still saved.</Text>
      )}
    </View>
  );

  const reasonLine = (icon: 'check' | 'cross' | 'question', text: string, color: string) => (
    <View key={icon + text} style={s.line}>
      <Icon name={icon} size={16} color={color} strokeWidth={2.25} />
      <Text style={[s.lineText, icon === 'question' && { color: t.ink2 }]}>{text}</Text>
    </View>
  );

  return (
    <View style={s.wrap}>
      <Stack.Screen options={{ title: 'Scale-count key', headerRight: () => <SavedMark /> }} />
      {best?.dangerous && best.score >= 0.8 && (
        <View style={s.venom} accessibilityRole="alert">
          <Text style={s.venomText}>Best match is</Text>
          <Tag label="VENOMOUS" venomous />
          <Text style={s.venomText}>
            <Text style={{ fontStyle: 'italic' }}>{best.scientificName}</Text>. Follow the handling protocol.
          </Text>
        </View>
      )}
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <T v="sub" dim style={{ marginHorizontal: 4 }}>
          {pack.disclaimer.split('.')[0]}. Sex: {e.sex}. Tail: {e.tailCondition ?? 'not set'}. Enter what you can see, in any order.
        </T>
        {result.checkNext && (
          <Group>
            <View style={s.next}>
              <Icon name="key" size={20} color={t.ink2} />
              <T v="title" style={{ flex: 1 }}>
                Check this next: {TRAIT_LABEL[result.checkNext]}
              </T>
            </View>
          </Group>
        )}

        <Group style={{ gap: 12, paddingVertical: 12 }}>
          {numberRow('dorsalRowsMidbody')}
          {CATS.map((c) => (
            <View style={fs.field} key={c.key}>
              <Text style={[fs.label, { marginHorizontal: 4 }]}>{cap(TRAIT_LABEL[c.key as keyof typeof TRAIT_LABEL])}</Text>
              <Chips options={c.options} value={counts[c.key] as string | undefined} onChange={(v) => set(c.key, v)} />
            </View>
          ))}
          {numberRow('ventrals')}
          {numberRow('subcaudals')}
        </Group>

        <GroupTitle>Best matches</GroupTitle>
        <Group>
          {shown.map((c, i) => (
            <View key={c.taxonId} style={s.cand}>
              <View style={s.candHead}>
                <T v="head" style={{ flex: 1 }}>
                  {i + 1}. <Text style={{ fontStyle: 'italic' }}>{c.scientificName}</Text>
                </T>
                {c.dangerous && <Tag label="VENOMOUS" venomous />}
              </View>
              <T v="small" dim style={{ fontWeight: '400' }}>
                {c.matched.length} match · {c.conflicts.length} conflict · {c.unknown.length} no data · score {Math.round(c.score * 100)}%
              </T>
              {c.matched.map((m) => reasonLine('check', m, t.onMark))}
              {c.conflicts.map((m) => reasonLine('cross', m, t.offMark))}
              {c.unknown.map((m) => reasonLine('question', m, t.ink2))}
              <Button label="Choose this species" kind={i === 0 ? 'primary' : 'grey'} size={i === 0 ? 56 : 48} onPress={() => choose(c)} style={{ marginTop: 4 }} />
            </View>
          ))}
        </Group>
        {result.candidates.length > shown.length && (
          <T v="sub" dim style={{ marginHorizontal: 4 }}>
            {result.candidates.length - shown.length} more not ruled out. Enter another trait to narrow it down.
          </T>
        )}
        {shown.length === 0 && (
          <Row>
            <T v="sub" dim>
              Nothing in the pack fits these traits. Check the counts, or choose Unidentified + photo.
            </T>
          </Row>
        )}
      </ScrollView>
    </View>
  );
}
