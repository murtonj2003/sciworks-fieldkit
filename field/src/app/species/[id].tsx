// Pick a species from the site's pack (or the Team Lead's shortlist), or mark it unidentified.
import type { Taxon } from '@sciworks/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { s as fs } from '@/components/fields';
import { Button, P, colors } from '@/components/ui';
import { getRecord, saveDraftNow } from '@/db/records';
import { listProvisionalTaxa } from '@/db/team';
import { touched } from '@/model/factory';
import { effectiveFields } from '@/model/form';
import type { LocalEncounter } from '@/model/records';
import { useField } from '@/state/field';

export default function SpeciesPicker() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pack, template, overlay, project, person } = useField();
  const provisional = listProvisionalTaxa(person?.teamId);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);

  const subset = useMemo(
    () => (template ? effectiveFields(template, overlay, 'encounter').find((f) => f.type === 'taxon')?.subset : undefined),
    [template, overlay],
  );
  const taxa = useMemo(() => {
    const list = (pack?.taxa ?? []).filter((t) => all || !subset || subset.includes(t.taxonId));
    const needle = q.trim().toLowerCase();
    return needle
      ? list.filter((t) => `${t.scientificName} ${t.commonName ?? ''} ${t.family ?? ''}`.toLowerCase().includes(needle))
      : list;
  }, [pack, subset, all, q]);

  function choose(change: (e: LocalEncounter) => LocalEncounter) {
    const e = getRecord<LocalEncounter>(id);
    if (!e) return;
    saveDraftNow(touched(change(e), project?.timeZone));
    router.back();
  }

  const pickTaxon = (t: Taxon) =>
    choose((e) => ({
      ...e,
      taxon: {
        ...e.taxon,
        taxonId: t.taxonId,
        scientificName: t.scientificName,
        unidentified: undefined,
        provisionalTaxonId: undefined,
        idBasis: e.taxon.idBasis === 'scale-key' || e.taxon.idBasis === 'photo-later' ? 'in-hand' : e.taxon.idBasis,
      },
    }));

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <TextInput style={fs.input} value={q} onChangeText={setQ} placeholder="Search name or family" placeholderTextColor={colors.dim} />
        {pack && <P dim>{pack.disclaimer}</P>}
        {subset && (
          <Button
            kind="secondary"
            label={all ? `Show the team shortlist (${subset.length})` : `Show all ${pack?.taxa.length ?? 0} in the pack`}
            onPress={() => setAll((a) => !a)}
          />
        )}
      </View>
      <FlatList
        data={taxa}
        keyExtractor={(t) => t.taxonId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button
              kind="secondary"
              label="Unidentified (add a photo)"
              onPress={() =>
                choose((e) => ({
                  ...e,
                  taxon: { idBasis: 'photo-later', unidentified: true },
                }))
              }
            />
            {provisional.map((t) => (
              <Pressable
                key={t.provisionalTaxonId}
                style={({ pressed }) => [styles.row, styles.provisional, pressed && { opacity: 0.6 }]}
                onPress={() =>
                  choose((e) => ({
                    ...e,
                    taxon: {
                      provisionalTaxonId: t.provisionalTaxonId,
                      scientificName: t.proposedName,
                      idBasis: e.taxon.idBasis === 'photo-later' || e.taxon.idBasis === 'scale-key' ? 'in-hand' : e.taxon.idBasis,
                    },
                  }))
                }
              >
                <Text style={styles.name}>{t.proposedName}</Text>
                <Text style={fs.small}>Added in the field · provisional until HQ decides</Text>
              </Pressable>
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.row, item.dangerous && styles.danger, pressed && { opacity: 0.6 }]} onPress={() => pickTaxon(item)}>
            <Text style={styles.name}>{item.scientificName}</Text>
            <Text style={fs.small}>
              {item.commonName ? `${item.commonName} · ` : ''}
              {item.family}
              {item.dangerous ? ' · ⚠ VENOMOUS' : ''}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFFFFF' },
  top: { padding: 16, gap: 8 },
  list: { padding: 16, paddingTop: 0, gap: 8, paddingBottom: 48 },
  row: { minHeight: 64, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, gap: 2 },
  danger: { borderColor: colors.red, borderWidth: 2 },
  provisional: { borderStyle: 'dashed', borderWidth: 2 },
  header: { gap: 8 },
  name: { fontSize: 18, fontWeight: '700', fontStyle: 'italic', color: colors.ink },
});
