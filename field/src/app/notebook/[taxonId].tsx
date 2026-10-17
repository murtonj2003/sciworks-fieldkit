// Field notebook: one species page (Jack, Sat 18:00; design pick 4C, fidelity pass Sat 21:15). A big photo with
// its credit laid over it, the name, the VENOMOUS warning, the pack's sourced facts as calm icon rows with value
// chips, look-alikes with the one count that tells them apart, then the caveats (taxonomy note, disclaimer) last.
// Opened from the species picker; with an animal in hand (`for`), the black pill chooses this species for it.
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { SpeciesPhoto } from '@/components/SpeciesPhoto';
import { BottomBar, Button, T, Tag } from '@/components/ui';
import { firstDifference, licenceShort, lookAlikes, photoOf, sizeLines, sourceHosts, splitSex, traitIcon, traitLines } from '@/lib/speciesGuide';
import { chooseTaxon } from '@/model/chooseTaxon';
import { useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 },
  credit: { position: 'absolute', left: 10, bottom: 8, right: 10, fontSize: 11, fontWeight: '500', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0.5 } },
  name: { fontSize: 26, lineHeight: 31, fontWeight: '600', fontStyle: 'italic', letterSpacing: -0.3, color: t.ink, marginTop: 14, marginHorizontal: 4 },
  fam: { ...type.sub, color: t.ink2, marginHorizontal: 4, marginTop: 2 },
  venom: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: t.offTint, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12 },
  venomText: { ...type.sub, lineHeight: 20, color: t.offTintInk, flex: 1 },
  card: { backgroundColor: t.card, borderRadius: radius.group, borderWidth: 1, borderColor: t.hair, overflow: 'hidden', marginTop: 16 },
  fact: { flexDirection: 'row', gap: 12, paddingVertical: 11, paddingHorizontal: 14 },
  factLabel: { ...type.sub, color: t.ink },
  chips: { gap: 6, marginTop: 6 },
  chipLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { alignSelf: 'flex-start', minHeight: 26, paddingHorizontal: 9, borderRadius: radius.tag, backgroundColor: t.group, justifyContent: 'center' },
  sex: { ...type.small, fontWeight: '400', color: t.ink2 },
  chipText: { ...type.small, fontSize: 14, color: t.ink, fontVariant: ['tabular-nums'] },
  sep: { height: 1, backgroundColor: t.hair, marginLeft: 46 },
  h: { ...type.title, color: t.ink, marginTop: 20, marginBottom: -8, marginHorizontal: 4 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  rowName: { ...type.body, fontSize: 16, lineHeight: 21, fontStyle: 'italic', fontWeight: '600', color: t.ink },
  compare: { flexShrink: 0, height: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: t.ink, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' },
  compareText: { ...type.small, fontSize: 14, fontWeight: '600', color: t.ink },
  caveat: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 20, marginHorizontal: 4, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.hair },
  caveatText: { ...type.small, fontWeight: '400', lineHeight: 18, color: t.ink2 },
}));

export default function Notebook() {
  const { taxonId, for: forId } = useLocalSearchParams<{ taxonId: string; for?: string }>();
  const { pack, project } = useField();
  const s = useStyles();
  const { t } = useTheme();
  const [noteOpen, setNoteOpen] = useState(false);
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
        <View>
          <SpeciesPhoto taxon={taxon} size={400} aspect={4 / 3} />
          {photo && (
            <Text style={s.credit} numberOfLines={1}>
              Photo: {photo.rightsHolder} · {licenceShort(photo.licence)}
            </Text>
          )}
        </View>
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

        {facts.length > 0 && <Text style={s.h}>What the species pack says</Text>}
        {facts.length > 0 && (
          <View style={s.card}>
            {facts.map((f, i) => (
              <View key={f.label}>
                {i > 0 && <View style={s.sep} />}
                <View style={s.fact} accessibilityLabel={`${f.label}: ${f.text.replace(/\n/g, ', ')}`}>
                  <Icon name={traitIcon(f.label)} size={20} color={t.ink2} strokeWidth={1.75} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.factLabel}>{f.label}</Text>
                    <View style={s.chips}>
                      {f.text.split('\n').map((v) => {
                        const { value, sex } = splitSex(v);
                        return (
                          <View key={v} style={s.chipLine}>
                            <View style={s.chip}>
                              <Text style={s.chipText}>{value}</Text>
                            </View>
                            {sex ? <Text style={s.sex}>{sex}</Text> : null}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {alikes.length > 0 && (
          <>
            <Text style={s.h}>Look-alikes</Text>
            <View style={s.card}>
              {alikes.map((o, i) => {
                const diff = firstDifference(taxon, o);
                return (
                  <View key={o.taxonId}>
                    {i > 0 && <View style={[s.sep, { marginLeft: 78 }]} />}
                    <View style={s.row}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Field notebook: ${o.scientificName}`}
                        onPress={() => router.push({ pathname: '/notebook/[taxonId]', params: { taxonId: o.taxonId, ...(forId ? { for: forId } : {}) } })}
                        style={({ pressed }) => [{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed && { opacity: 0.7 }]}
                      >
                        <SpeciesPhoto taxon={o} size={56} />
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                          <Text style={s.rowName} numberOfLines={2}>
                            {o.scientificName}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, rowGap: 4 }}>
                            <T v="sub" dim>
                              {o.family}
                            </T>
                            {o.dangerous && <Tag label="VENOMOUS" venomous />}
                          </View>
                          <T v="small" dim style={{ fontWeight: '400' }}>
                            {diff ?? 'No clear count difference in the pack'}
                          </T>
                        </View>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Compare with ${o.scientificName}`}
                        onPress={() => router.push({ pathname: '/compare', params: { a: taxon.taxonId, b: o.taxonId, ...(forId ? { for: forId } : {}) } })}
                        hitSlop={8}
                        style={({ pressed }) => [s.compare, pressed && { backgroundColor: t.secPress }]}
                      >
                        <Text style={s.compareText}>Compare</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={s.caveat}>
          <Icon name="info" size={18} color={t.ink2} />
          <View style={{ flex: 1, gap: 8 }}>
            {taxon.note && (
              <View>
                <Text style={s.caveatText} numberOfLines={noteOpen ? undefined : 2}>
                  <Text style={{ fontWeight: '600', color: t.ink }}>Name note. </Text>
                  {taxon.note}
                </Text>
                {!noteOpen && <Button kind="link" label="Read more" onPress={() => setNoteOpen(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 40 }} />}
              </View>
            )}
            <Text style={s.caveatText}>
              Illustrative demo pack, not for field ID. Sourced from {hosts.length ? hosts.join(', ') : 'the pack'}; many ranges come from outside Costa Rica.
            </Text>
          </View>
        </View>
      </ScrollView>
      {forId && (
        <BottomBar>
          <Button
            size={56}
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
