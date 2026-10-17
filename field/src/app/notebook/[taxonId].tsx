// Field notebook: one species page (Jack, Sat 18:00; design pick 4C). Photo with its credit, the VENOMOUS
// warning, the pack's sourced scale counts and sizes, its taxonomy note, and look-alikes to compare. Opened from
// the species picker; with an animal in hand (`for`), the black pill chooses this species for it.
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { SpeciesPhoto } from '@/components/SpeciesPhoto';
import { BottomBar, Button, Group, GroupTitle, T, Tag } from '@/components/ui';
import { licenceShort, lookAlikes, photoOf, sizeLines, sourceHosts, traitLines } from '@/lib/speciesGuide';
import { chooseTaxon } from '@/model/chooseTaxon';
import { useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  credit: { ...type.micro, color: t.ink2, marginTop: 6, marginHorizontal: 4 },
  name: { fontSize: 26, fontWeight: '700', fontStyle: 'italic', letterSpacing: -0.3, color: t.ink, marginTop: 14, marginHorizontal: 4 },
  fam: { ...type.sub, color: t.ink2, marginHorizontal: 4, marginTop: 2 },
  venom: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: t.offTint, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12 },
  venomText: { ...type.sub, lineHeight: 20, color: t.offTintInk, flex: 1 },
  list: { backgroundColor: t.card, borderRadius: radius.card, overflow: 'hidden' },
  kv: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11, paddingHorizontal: 14 },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 14 },
  k: { ...type.sub, fontWeight: '600', color: t.ink, width: 140 },
  v: { ...type.sub, color: t.ink, flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14 },
  noteText: { ...type.sub, color: t.ink2, flex: 1, lineHeight: 20 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12 },
  rowName: { ...type.body, fontStyle: 'italic', fontWeight: '600', color: t.ink },
  pill: { height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: t.group, alignItems: 'center', justifyContent: 'center' },
  pillText: { ...type.small, fontWeight: '600', color: t.ink },
}));

export default function Notebook() {
  const { taxonId, for: forId } = useLocalSearchParams<{ taxonId: string; for?: string }>();
  const { pack, project } = useField();
  const s = useStyles();
  const { t } = useTheme();
  const taxon = pack?.taxa.find((x) => x.taxonId === taxonId);
  if (!pack || !taxon) return <T>This species is not in the pack on this phone.</T>;
  const photo = photoOf(taxon);
  const facts = [...traitLines(taxon), ...sizeLines(taxon)];
  const alikes = lookAlikes(taxon, pack);
  const hosts = sourceHosts(taxon);

  const choose = () => {
    if (!forId) return;
    chooseTaxon(forId, taxon, project?.timeZone);
    router.dismissTo({ pathname: '/encounter/[id]', params: { id: forId } });
  };

  return (
    <View style={s.wrap}>
      <Stack.Screen options={{ title: 'Field notebook' }} />
      <ScrollView contentContainerStyle={s.page}>
        <SpeciesPhoto taxon={taxon} size={210} round={false} width="100%" />
        {photo && (
          <Text style={s.credit}>
            Photo: {photo.rightsHolder} · {licenceShort(photo.licence)}
          </Text>
        )}
        <Text style={s.name}>{taxon.scientificName}</Text>
        <Text style={s.fam}>{[taxon.commonName, taxon.family].filter(Boolean).join(' · ')}</Text>
        {taxon.dangerous && (
          <View style={s.venom} accessibilityRole="alert">
            <Icon name="warning" size={22} color={t.offTintInk} strokeWidth={2} />
            <Text style={s.venomText}>
              <Text style={{ fontWeight: '800', letterSpacing: 0.9 }}>VENOMOUS</Text>. Do not handle without the protocol.
            </Text>
          </View>
        )}

        {facts.length > 0 && (
          <>
            <GroupTitle>What the pack says</GroupTitle>
            <Group>
              <View style={s.list}>
                {facts.map((f, i) => (
                  <View key={f.label}>
                    {i > 0 && <View style={s.sep} />}
                    <View style={s.kv}>
                      <Text style={s.k}>{f.label}</Text>
                      <Text style={s.v}>{f.text}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Group>
          </>
        )}

        {taxon.note && (
          <Group style={{ marginTop: 10 }}>
            <View style={[s.list, s.note]}>
              <Icon name="info" size={18} color={t.ink2} />
              <Text style={s.noteText}>{taxon.note}</Text>
            </View>
          </Group>
        )}

        {alikes.length > 0 && (
          <>
            <GroupTitle>Look-alikes</GroupTitle>
            <Group>
              <View style={s.list}>
                {alikes.map((o, i) => (
                  <View key={o.taxonId}>
                    {i > 0 && <View style={[s.sep, { marginLeft: 88 }]} />}
                    <View style={s.row}>
                      <SpeciesPhoto taxon={o} size={56} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={s.rowName}>{o.scientificName}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <T v="sub" dim>
                            {o.family}
                          </T>
                          {o.dangerous && <Tag label="VENOMOUS" venomous />}
                        </View>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Compare with ${o.scientificName}`}
                        onPress={() => router.push({ pathname: '/compare', params: { a: taxon.taxonId, b: o.taxonId, ...(forId ? { for: forId } : {}) } })}
                        hitSlop={6}
                        style={({ pressed }) => [s.pill, pressed && { backgroundColor: t.greyPress }]}
                      >
                        <Text style={s.pillText}>Compare</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </Group>
          </>
        )}

        <T v="small" dim style={{ marginTop: 14, marginHorizontal: 4, fontWeight: '400' }}>
          {pack.disclaimer.split('.')[0]}. Every value is sourced{hosts.length ? `: ${hosts.join(', ')}` : ''}.
        </T>
      </ScrollView>
      {forId && (
        <BottomBar>
          <Button
            size={64}
            label={
              <>
                Choose <Text style={{ fontStyle: 'italic' }}>{taxon.scientificName}</Text>
              </>
            }
            onPress={choose}
          />
        </BottomBar>
      )}
    </View>
  );
}
