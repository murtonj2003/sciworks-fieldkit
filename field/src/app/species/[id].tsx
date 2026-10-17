// P5 · Pick a species from the site's pack (or the Team Lead's shortlist), or mark it unidentified.
// Forgiving search (shared searchTaxa): a misheard or misspelt name still finds the species, marked as a close
// match so the surveyor checks it. Kit: grey search field, Results group of plain rows, shortlist group, two row
// buttons pinned at the bottom.
import { searchTaxa, type Taxon, type TaxonMatch } from '@sciworks/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { BottomBar, Button, Group, GroupTitle, T, Tag } from '@/components/ui';
import { clearFresh, getRecord, listRecords, saveDraftNow } from '@/db/records';
import { listProvisionalTaxa } from '@/db/team';
import { touched } from '@/model/factory';
import { effectiveFields } from '@/model/form';
import type { LocalEncounter } from '@/model/records';
import { useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

type RowItem = { taxon: Taxon; match?: TaxonMatch };

const WEB_NO_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {};

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  search: { height: 60, borderRadius: radius.card, backgroundColor: t.group, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 4, borderWidth: 2, borderColor: 'transparent' },
  searchFocus: { borderColor: t.ink },
  q: { fontSize: 20, color: t.ink, flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 0, ...WEB_NO_OUTLINE },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  row: { minHeight: 56, paddingVertical: 10, paddingHorizontal: 14, justifyContent: 'center', gap: 3 },
  rowTall: { minHeight: 70, paddingTop: 11, paddingBottom: 10, justifyContent: 'flex-start' },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 14 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  name: { ...type.body, fontStyle: 'italic', color: t.ink, flexShrink: 1 },
  fam: { ...type.sub, color: t.ink2, marginLeft: 'auto' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteText: { ...type.sub, color: t.ink2 },
  prov: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.ink2, borderRadius: radius.card, minHeight: 64, paddingVertical: 9, paddingHorizontal: 13, gap: 2, justifyContent: 'center' },
  rowBtn: { minHeight: 56, borderRadius: radius.card, backgroundColor: t.sec, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  rowBtnText: { ...type.title, color: t.ink, flex: 1 },
  pill: { height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: t.group, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  pillText: { ...type.small, fontWeight: '600', color: t.ink },
}));

export default function SpeciesPicker() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { pack, template, overlay, project, person } = useField();
  const s = useStyles();
  const { t } = useTheme();
  const provisional = listProvisionalTaxa(person?.teamId);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [focus, setFocus] = useState(false);

  const subset = useMemo(
    () => (template ? effectiveFields(template, overlay, 'encounter').find((f) => f.type === 'taxon')?.subset : undefined),
    [template, overlay],
  );
  const rows = useMemo((): RowItem[] => {
    const list = (pack?.taxa ?? []).filter((x) => all || !subset || subset.includes(x.taxonId));
    if (!q.trim()) return list.map((taxon) => ({ taxon }));
    return searchTaxa(q, list, { limit: list.length }).map((match) => ({ taxon: match.taxon, match }));
  }, [pack, subset, all, q]);
  const animalNumber = useMemo(() => {
    const me = getRecord<LocalEncounter>(id);
    if (!me) return 1;
    const sibs = listRecords<LocalEncounter>('encounter')
      .filter((o) => o.surveyId === me.surveyId && o.status === 'active')
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    return Math.max(1, sibs.findIndex((o) => o.id === me.id) + 1);
  }, [id]);
  const shortlist = useMemo(() => (subset ? (pack?.taxa ?? []).filter((x) => subset.includes(x.taxonId)) : []), [pack, subset]);

  function choose(change: (e: LocalEncounter) => LocalEncounter) {
    const e = getRecord<LocalEncounter>(id);
    if (!e) return;
    saveDraftNow(touched(change(e), project?.timeZone));
    clearFresh(id); // a species was chosen: keep this animal
    router.back();
  }

  const pickTaxon = (x: Taxon) =>
    choose((e) => ({
      ...e,
      taxon: {
        ...e.taxon,
        taxonId: x.taxonId,
        scientificName: x.scientificName,
        unidentified: undefined,
        provisionalTaxonId: undefined,
        idBasis: e.taxon.idBasis === 'scale-key' || e.taxon.idBasis === 'photo-later' ? 'in-hand' : e.taxon.idBasis,
      },
    }));

  /** Bold the shared start of what was typed and the name, when it is 3+ letters (kit: "**Lept**odeira ornata"). */
  const nameWithMatch = (item: RowItem) => {
    const name = item.taxon.scientificName;
    const typed = q.trim().toLowerCase();
    let n = 0;
    while (n < typed.length && n < name.length && typed[n] === name[n]!.toLowerCase()) n++;
    if (n < 3) return <Text style={s.name}>{name}</Text>;
    return (
      <Text style={s.name}>
        <Text style={{ fontWeight: '700' }}>{name.slice(0, n)}</Text>
        {name.slice(n)}
      </Text>
    );
  };

  const speciesRow = (item: RowItem, i: number) => {
    const close = item.match?.reason === 'spelling' || item.match?.reason === 'sounds-like';
    return (
      <View key={item.taxon.taxonId}>
        {i > 0 && <View style={s.sep} />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.taxon.scientificName}, ${item.taxon.family ?? ''}${item.taxon.dangerous ? ', venomous' : ''}${close ? ', close match' : ''}`}
          onPress={() => pickTaxon(item.taxon)}
          style={({ pressed }) => [s.row, (close || item.taxon.dangerous) && s.rowTall, pressed && { backgroundColor: t.secPress }]}
        >
          <View style={s.line}>
            {nameWithMatch(item)}
            {item.taxon.family ? <Text style={s.fam}>{item.taxon.family}</Text> : null}
          </View>
          {close && (
            <View style={s.note}>
              <Icon name="spell" size={16} color={t.ink2} />
              <Text style={s.noteText}>Close match for “{q.trim()}”</Text>
            </View>
          )}
          {item.taxon.dangerous && (
            <View style={{ marginTop: 5 }}>
              <Tag label="VENOMOUS" venomous />
            </View>
          )}
        </Pressable>
      </View>
    );
  };

  const total = pack?.taxa.length ?? 0;

  return (
    <View style={s.wrap}>
      <Stack.Screen
        options={{
          title: 'Choose species',
          headerRight: () => (
            <View style={s.pill}>
              <Text style={s.pillText}>Animal {animalNumber}</Text>
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={[s.search, focus && s.searchFocus]}>
          <Icon name="search" size={22} color={t.ink2} />
          <TextInput
            style={s.q}
            value={q}
            onChangeText={setQ}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder="Search name or family"
            placeholderTextColor={t.ink2}
            autoCorrect={false}
            accessibilityLabel="Search species"
          />
          {q.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQ('')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="clear" size={22} color={t.ink2} />
            </Pressable>
          )}
        </View>
        {subset && (
          <View style={{ alignItems: 'flex-start' }}>
            <Button kind="link" label={all ? `Show the team shortlist (${subset.length})` : `Show all ${total} in the pack`} onPress={() => setAll((a) => !a)} />
          </View>
        )}

        {rows.length > 0 && <GroupTitle>{q.trim() ? 'Results' : subset && !all ? 'Team shortlist' : 'Species in the pack'}</GroupTitle>}
        <Group style={rows.length === 0 ? { marginTop: 12 } : undefined}>
          {!q.trim() &&
            provisional.map((p) => (
              <Pressable
                key={p.provisionalTaxonId}
                accessibilityRole="button"
                style={({ pressed }) => [s.prov, pressed && { backgroundColor: t.grey }]}
                onPress={() =>
                  choose((e) => ({
                    ...e,
                    taxon: {
                      provisionalTaxonId: p.provisionalTaxonId,
                      scientificName: p.proposedName,
                      idBasis: e.taxon.idBasis === 'photo-later' || e.taxon.idBasis === 'scale-key' ? 'in-hand' : e.taxon.idBasis,
                    },
                  }))
                }
              >
                <Text style={s.name}>
                  {p.proposedName.split(/(\bsp\.)/).map((part, k) => (
                    <Text key={k} style={part === 'sp.' ? { fontStyle: 'normal' } : undefined}>
                      {part}
                    </Text>
                  ))}
                </Text>
                <Text style={s.noteText}>Added in the field · provisional until HQ decides</Text>
              </Pressable>
            ))}
          {rows.length > 0 ? (
            <View style={s.list}>{rows.map(speciesRow)}</View>
          ) : (
            <View style={[s.list, { paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', gap: 6 }]}>
              <Icon name="search" size={24} color={t.ink2} />
              <T v="title" style={{ textAlign: 'center' }}>
                Nothing matches “{q.trim()}”.
              </T>
              <T v="sub" dim style={{ textAlign: 'center' }}>
                Try fewer letters, or mark it Unidentified + photo.
              </T>
            </View>
          )}
        </Group>

        {!!q.trim() && !!subset && !all && shortlist.length > 0 && (
          <>
            <GroupTitle>Team shortlist</GroupTitle>
            <Group>
              <View style={s.list}>{shortlist.map((taxon, i) => speciesRow({ taxon }, i))}</View>
            </Group>
          </>
        )}

        {pack && (
          <T v="small" dim style={{ marginTop: 14, marginHorizontal: 4, fontWeight: '400' }}>
            {pack.disclaimer}
          </T>
        )}
      </ScrollView>

      <BottomBar>
        <Group style={{ gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [s.rowBtn, pressed && { backgroundColor: t.secPress }]}
            onPress={() => choose((e) => ({ ...e, taxon: { idBasis: 'photo-later', unidentified: true } }))}
          >
            <Icon name="camera" size={22} color={t.ink} strokeWidth={2} />
            <Text style={s.rowBtnText}>Unidentified + photo</Text>
            <Icon name="chev" size={20} color={t.ink2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [s.rowBtn, pressed && { backgroundColor: t.secPress }]}
            onPress={() => router.replace({ pathname: '/key/[id]', params: { id } })}
          >
            <Icon name="key" size={22} color={t.ink} strokeWidth={2} />
            <Text style={s.rowBtnText}>Scale key</Text>
            <Icon name="chev" size={20} color={t.ink2} />
          </Pressable>
        </Group>
      </BottomBar>
    </View>
  );
}
