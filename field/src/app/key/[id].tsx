// Scale-count key: enter traits in any order, see ranked candidates with the reasons, pick one.
// The counts are saved on the animal as they're typed; the key only ever suggests.
import { TRAIT_LABEL, runKey, type KeyCandidate, type ScaleCounts } from '@sciworks/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chips, NumberInput, s as fs } from '@/components/fields';
import { Button, Card, H2, P, colors } from '@/components/ui';
import { useRecord } from '@/hooks/useRecord';
import type { LocalEncounter } from '@/model/records';
import { useField } from '@/state/field';

const CATS: { key: keyof ScaleCounts; options: { code: string; label: string }[] }[] = [
  { key: 'analPlate', options: [{ code: 'single', label: 'Single' }, { code: 'divided', label: 'Divided' }] },
  { key: 'keeled', options: [{ code: 'smooth', label: 'Smooth' }, { code: 'weak', label: 'Weakly keeled' }, { code: 'keeled', label: 'Keeled' }] },
  { key: 'loreal', options: [{ code: 'present', label: 'Present' }, { code: 'absent', label: 'Absent' }] },
  { key: 'pupil', options: [{ code: 'round', label: 'Round' }, { code: 'vertical', label: 'Vertical' }, { code: 'horizontal', label: 'Horizontal' }] },
];

export default function KeyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pack } = useField();
  const { record: e, update } = useRecord<LocalEncounter>(id);
  const counts = e?.scaleCounts ?? {};
  const result = useMemo(
    () => (pack && e ? runKey({ ...counts, sex: e.sex, tailCondition: e.tailCondition }, pack) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pack, e?.scaleCounts, e?.sex, e?.tailCondition],
  );
  if (!e || !pack || !result) return <P>Load a project first.</P>;

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
    <View style={styles.trait} key={key}>
      <Text style={fs.label}>{TRAIT_LABEL[key][0]!.toUpperCase() + TRAIT_LABEL[key].slice(1)}</Text>
      <NumberInput integer value={counts[key]} onChange={(v) => set(key, v)} />
      {key === 'subcaudals' && !tailOk && (
        <Text style={fs.small}>Ignored by the key: the tail is {e.tailCondition ?? 'not marked intact'}. The count is still saved.</Text>
      )}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <P dim>
        {pack.disclaimer}. Sex: {e.sex}. Tail: {e.tailCondition ?? 'not set'}. Enter what you can see, in any order.
      </P>
      {result.checkNext && (
        <Card style={styles.next}>
          <P>Check this next: {TRAIT_LABEL[result.checkNext]}</P>
        </Card>
      )}

      {numberRow('dorsalRowsMidbody')}
      {CATS.map((c) => (
        <View style={styles.trait} key={c.key}>
          <Text style={fs.label}>{TRAIT_LABEL[c.key as keyof typeof TRAIT_LABEL][0]!.toUpperCase() + TRAIT_LABEL[c.key as keyof typeof TRAIT_LABEL].slice(1)}</Text>
          <Chips options={c.options} value={counts[c.key] as string | undefined} onChange={(v) => set(c.key, v)} />
        </View>
      ))}
      {numberRow('ventrals')}
      {numberRow('subcaudals')}

      {best?.dangerous && best.score >= 0.8 && (
        <View style={styles.danger} accessibilityRole="alert">
          <Text style={styles.dangerText}>⚠ Best match is VENOMOUS: {best.scientificName}. Follow the handling protocol.</Text>
        </View>
      )}

      <H2>Best matches</H2>
      {shown.map((c, i) => (
        <Card key={c.taxonId} style={c.dangerous ? styles.dangerCard : undefined}>
          <Text style={styles.name}>
            {i + 1}. {c.scientificName}
            {c.dangerous ? '  ⚠ venomous' : ''}
          </Text>
          <Text style={fs.small}>
            {c.matched.length} match · {c.conflicts.length} conflict · {c.unknown.length} no data · score {Math.round(c.score * 100)}%
          </Text>
          {c.matched.map((m) => (
            <Text key={m} style={styles.ok}>✓ {m}</Text>
          ))}
          {c.conflicts.map((m) => (
            <Text key={m} style={styles.bad}>✗ {m}</Text>
          ))}
          {c.unknown.map((m) => (
            <Text key={m} style={fs.small}>? {m}</Text>
          ))}
          <Button label="Choose this species" kind={i === 0 ? 'primary' : 'secondary'} onPress={() => choose(c)} />
        </Card>
      ))}
      {result.candidates.length > shown.length && (
        <P dim>{result.candidates.length - shown.length} more not ruled out. Enter another trait to narrow it down.</P>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 64 },
  trait: { gap: 6 },
  next: { borderColor: colors.primary, borderWidth: 2 },
  name: { fontSize: 19, fontWeight: '800', fontStyle: 'italic', color: colors.ink },
  ok: { fontSize: 16, color: colors.green },
  bad: { fontSize: 16, color: colors.red },
  danger: { backgroundColor: colors.red, borderRadius: 12, padding: 14 },
  dangerText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  dangerCard: { borderColor: colors.red, borderWidth: 2 },
});
