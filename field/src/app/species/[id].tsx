// P5 · Pick a species from the site's pack (or the Team Lead's shortlist), or mark it unidentified.
// Forgiving search (shared searchTaxa): a misheard or misspelt name still finds the species, marked as a close
// match so the surveyor checks it. Layout = comp 4C (fidelity pass, Sat 21:00): a white search field, the best hit
// alone in a "Top match" tray with a bigger photo, then "Not sure? Compare look-alikes" (each with Guide), then
// the other hits; every row has an outlined Guide button (Jack's pick). Unidentified + photo and the Scale key sit
// at the end of the list, then an honest offline line and the pack disclaimer.
import { searchTaxa, type Taxon, type TaxonMatch } from '@sciworks/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { SpeciesPhoto } from '@/components/SpeciesPhoto';
import { lookAlikes } from '@/lib/speciesGuide';
import { Button, Group, GroupTitle, T, Tag, TrayTitle } from '@/components/ui';
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
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, gap: 12 },
  search: { height: 50, borderRadius: radius.card, backgroundColor: t.card, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 2, borderWidth: 1, borderColor: t.hair },
  searchFocus: { borderColor: t.ink, borderWidth: 1.5 },
  q: { fontSize: 17, color: t.ink, flex: 1, minWidth: 0, minHeight: 46, paddingVertical: 0, ...WEB_NO_OUTLINE },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 78 },
  prow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingLeft: 10, paddingRight: 10 },
  prowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  fam2: { ...type.sub, color: t.ink2 },
  guide: { height: 30, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: t.ink, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' },
  guideText: { ...type.small, fontSize: 14, fontWeight: '500', color: t.ink },
  name: { ...type.body, fontSize: 16, lineHeight: 21, fontStyle: 'italic', fontWeight: '600', color: t.ink, flexShrink: 1 },
  nameBig: { fontSize: 18, lineHeight: 23 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 6 },
  noteText: { ...type.sub, color: t.ink2 },
  prov: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.ink2, borderRadius: radius.card, minHeight: 64, paddingVertical: 9, paddingHorizontal: 13, gap: 2, justifyContent: 'center' },
  arow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  more: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  foot: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 14, marginHorizontal: 6, borderTopWidth: 1, borderTopColor: t.hair },
  pill: { height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: t.group, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  // Comp 4C: the white list sits flush in its tray, under the grey heading band.
  tray: { padding: 0, gap: 0, overflow: 'hidden' },
  flush: { backgroundColor: t.card, borderRadius: 0 },
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
  const [more, setMore] = useState(false);

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
  const searching = !!q.trim();
  const top = searching ? rows[0] : undefined;
  const alikes = useMemo(() => (top && pack ? lookAlikes(top.taxon, pack) : []), [top, pack]);
  // Other hits, minus any already shown as a look-alike.
  const rest = searching ? rows.slice(1).filter((r) => !alikes.some((o) => o.taxonId === r.taxon.taxonId)) : [];

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
    if (n < 3) return name;
    return (
      <>
        <Text style={{ fontWeight: '700' }}>{name.slice(0, n)}</Text>
        {name.slice(n)}
      </>
    );
  };

  const guideButton = (x: Taxon) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Field notebook: ${x.scientificName}`}
      onPress={() => router.push({ pathname: '/notebook/[taxonId]', params: { taxonId: x.taxonId, for: id } })}
      hitSlop={10}
      style={({ pressed }) => [s.guide, pressed && { backgroundColor: t.secPress }]}
    >
      <Text style={s.guideText}>Guide</Text>
    </Pressable>
  );

  /** One species: photo, italic name (never cut short), family + VENOMOUS, Guide. `big` = the Top match. `onPress`
   * defaults to choosing it; look-alike rows open the compare sheet instead. */
  const speciesRow = (item: RowItem, i: number, opts: { big?: boolean; onPress?: () => void; label?: string } = {}) => (
    <View key={item.taxon.taxonId}>
      {i > 0 && <View style={[s.sep, opts.big && { marginLeft: 94 }]} />}
      <View style={[s.prow, opts.big && { minHeight: 92 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={opts.label ?? `${item.taxon.scientificName}, ${item.taxon.family ?? ''}${item.taxon.dangerous ? ', venomous' : ''}`}
          onPress={opts.onPress ?? (() => pickTaxon(item.taxon))}
          style={({ pressed }) => [s.prowMain, pressed && { opacity: 0.7 }]}
        >
          <SpeciesPhoto taxon={item.taxon} size={opts.big ? 72 : 56} />
          <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
            <Text style={[s.name, opts.big && s.nameBig]}>
              {opts.big ? nameWithMatch(item) : item.taxon.scientificName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, rowGap: 4 }}>
              {item.taxon.family ? <Text style={s.fam2}>{item.taxon.family}</Text> : null}
              {item.taxon.dangerous && <Tag label="VENOMOUS" venomous />}
            </View>
          </View>
        </Pressable>
        {guideButton(item.taxon)}
      </View>
    </View>
  );

  const total = pack?.taxa.length ?? 0;

  return (
    <View style={s.wrap}>
      <Stack.Screen
        options={{
          title: 'Species',
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

        {searching && top && (
          <View style={s.note}>
            <Icon name="spell" size={16} color={t.ink2} />
            <Text style={s.noteText}>
              {top.match?.reason === 'spelling' || top.match?.reason === 'sounds-like' ? 'Close match for' : 'Best match for'} <Text style={{ fontStyle: 'italic' }}>{q.trim()}</Text>
            </Text>
          </View>
        )}

        {!searching && provisional.length > 0 && (
          <Group>
            {provisional.map((p) => (
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
          </Group>
        )}

        {searching && rows.length === 0 && (
          <Group>
            <View style={[s.list, { paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', gap: 6 }]}>
              <Icon name="search" size={24} color={t.ink2} />
              <T v="title" style={{ textAlign: 'center' }}>
                Nothing matches “{q.trim()}”.
              </T>
              <T v="sub" dim style={{ textAlign: 'center' }}>
                Try fewer letters, or mark it Unidentified + photo below.
              </T>
            </View>
          </Group>
        )}

        {searching && top && (
          <Group style={s.tray}>
            <TrayTitle>Top match</TrayTitle>
            <View style={s.flush}>{speciesRow(top, 0, { big: true })}</View>
          </Group>
        )}

        {searching && top && (alikes.length > 0 || rest.length > 0) && (
          <Group style={s.tray}>
            {alikes.length > 0 && <TrayTitle>Not sure? Compare look-alikes</TrayTitle>}
            {alikes.length > 0 && (
              <View style={s.flush}>
                {alikes.map((o, i) =>
                  speciesRow({ taxon: o }, i, {
                    label: `Compare ${top.taxon.scientificName} with ${o.scientificName}`,
                    onPress: () => router.push({ pathname: '/compare', params: { a: top.taxon.taxonId, b: o.taxonId, for: id } }),
                  }),
                )}
              </View>
            )}
            {rest.length > 0 && !more && (
              <Pressable accessibilityRole="button" onPress={() => setMore(true)} style={({ pressed }) => [s.more, pressed && { opacity: 0.6 }]}>
                <Text style={[type.sub, { color: t.ink }]}>See more results ({rest.length})</Text>
                <Icon name="chev" size={18} color={t.ink2} />
              </Pressable>
            )}
            {rest.length > 0 && more && (
              <>
                <TrayTitle>More results</TrayTitle>
                <View style={s.flush}>{rest.map((item, i) => speciesRow(item, i))}</View>
              </>
            )}
          </Group>
        )}

        {!searching && rows.length > 0 && (
          <Group style={s.tray}>
            <TrayTitle>{subset && !all ? 'Team shortlist' : 'Species in the pack'}</TrayTitle>
            <View style={s.flush}>{rows.map((item, i) => speciesRow(item, i))}</View>
          </Group>
        )}

        {searching && !!subset && !all && shortlist.length > 0 && (
          <Group style={s.tray}>
            <TrayTitle>Team shortlist</TrayTitle>
            <View style={s.flush}>{shortlist.map((taxon, i) => speciesRow({ taxon }, i))}</View>
          </Group>
        )}

        <Group style={s.tray}>
          <TrayTitle>Can't tell?</TrayTitle>
          <View style={s.flush}>
            <Pressable accessibilityRole="button" style={({ pressed }) => [s.arow, pressed && { backgroundColor: t.secPress }]} onPress={() => choose((e) => ({ ...e, taxon: { idBasis: 'photo-later', unidentified: true } }))}>
              <Icon name="camera" size={22} color={t.ink} />
              <Text style={[type.body, { color: t.ink, flex: 1 }]}>Unidentified + photo</Text>
              <Icon name="chev" size={18} color={t.ink2} />
            </Pressable>
            <View style={[s.sep, { marginLeft: 48 }]} />
            <Pressable accessibilityRole="button" style={({ pressed }) => [s.arow, pressed && { backgroundColor: t.secPress }]} onPress={() => router.replace({ pathname: '/key/[id]', params: { id } })}>
              <Icon name="key" size={22} color={t.ink} />
              <Text style={[type.body, { color: t.ink, flex: 1 }]}>Scale key</Text>
              <Icon name="chev" size={18} color={t.ink2} />
            </Pressable>
          </View>
        </Group>

        <View style={s.foot}>
          <Icon name="cloud-off" size={20} color={t.ink2} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.sub, { color: t.ink }]}>Works offline</Text>
            <Text style={[type.small, { fontWeight: '400', color: t.ink2 }]}>The guide facts are on this phone. Photos show once seen with signal.</Text>
            {pack && <Text style={[type.small, { fontWeight: '400', color: t.ink2, marginTop: 6 }]}>{pack.disclaimer}</Text>}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
