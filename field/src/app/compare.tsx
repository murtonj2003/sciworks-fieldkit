// Field notebook · compare two look-alikes (design pick 4C, fidelity pass Sat 21:10): a sheet titled "Field
// notebook — compare", two columns split by one long line, each with its photo, name and its own list of traits
// (a small icon, the label, the value). A value sits in a soft green chip only when the two really don't overlap,
// because that is a real way to tell them apart (Jack's pick: follow the mockup's colours). Real pack data only.
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { PhotoCredit, SpeciesPhoto } from '@/components/SpeciesPhoto';
import { Button, Pair, T, Tag } from '@/components/ui';
import { NO_DATA, compareRows, splitSex } from '@/lib/speciesGuide';
import { chooseTaxon } from '@/model/chooseTaxon';
import { useField } from '@/state/field';
import { makeStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const WEB = Platform.OS === 'web';

const useStyles = makeStyles((t) => ({
  // Phones get a real form sheet; the browser preview draws the same sheet over a dimmed backdrop.
  backdrop: { flex: 1, backgroundColor: WEB ? t.scrim : t.card, justifyContent: 'flex-end' },
  sheet: { flex: WEB ? undefined : 1, maxHeight: WEB ? '72%' : undefined, backgroundColor: t.card, borderTopLeftRadius: WEB ? radius.dialog : 0, borderTopRightRadius: WEB ? radius.dialog : 0, overflow: 'hidden' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: t.greyPress, marginTop: 8 },
  page: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 24 },
  title: { ...type.headBold, color: t.ink, marginBottom: 14 },
  cols: { flexDirection: 'row', gap: 16 },
  col: { flex: 1, minWidth: 0 },
  name: { ...type.title, fontStyle: 'italic', color: t.ink, marginTop: 8 },
  rows: { marginTop: 14, gap: 16 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  labelText: { ...type.small, fontSize: 14, fontWeight: '500', color: t.ink, flexShrink: 1 },
  value: { paddingLeft: 26, marginTop: 4, gap: 2 },
  valueText: { ...type.sub, color: t.ink2, fontVariant: ['tabular-nums'] },
  none: { ...type.small, fontWeight: '400', color: t.ink2 },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: { backgroundColor: t.onTint, borderRadius: radius.tag, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { ...type.sub, fontWeight: '500', color: t.onInk, fontVariant: ['tabular-nums'] },
  sex: { ...type.small, fontWeight: '400', color: t.ink2 },
  divider: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, marginLeft: -0.5, backgroundColor: t.hair },
  venom: { position: 'absolute', left: 8, bottom: 8 },
  legend: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 18 },
  legendText: { ...type.sub, color: t.ink2, flex: 1 },
  bar: { paddingHorizontal: 16, paddingTop: 10, gap: 8, backgroundColor: t.card, borderTopWidth: 1, borderTopColor: t.hair },
}));

export default function Compare() {
  const { a, b, for: forId } = useLocalSearchParams<{ a: string; b: string; for?: string }>();
  const { pack, project } = useField();
  const s = useStyles();
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const ta = pack?.taxa.find((x) => x.taxonId === a);
  const tb = pack?.taxa.find((x) => x.taxonId === b);
  if (!ta || !tb) {
    return (
      <View style={s.backdrop}>
        <Stack.Screen options={{ headerShown: false }} />
        {WEB && <Pressable accessibilityRole="button" accessibilityLabel="Close compare" style={{ flex: 1 }} onPress={() => router.back()} />}
        <View style={[s.sheet, s.page, { gap: 12 }]}>
          <T>These species are not in the pack on this phone.</T>
          <Button label="Close" kind="grey" size={48} onPress={() => router.back()} />
        </View>
      </View>
    );
  }
  const rows = compareRows(ta, tb);
  const anyDiffer = rows.some((r) => r.differ);
  const pick = (x: typeof ta) => {
    if (!forId) return;
    chooseTaxon(forId, x, project?.timeZone);
    router.dismissTo({ pathname: '/encounter/[id]', params: { id: forId } });
  };

  const cell = (text: string, differ: boolean) => (
    <View style={s.value}>
      {text === NO_DATA ? (
        <Text style={s.none}>{NO_DATA}</Text>
      ) : (
        text.split('\n').map((line) => {
          const { value, sex } = splitSex(line);
          return (
            <View key={line} style={s.line}>
              {differ ? (
                <View style={s.chip}>
                  <Text style={s.chipText}>{value}</Text>
                </View>
              ) : (
                <Text style={s.valueText}>{value}</Text>
              )}
              {sex ? <Text style={s.sex}>{sex}</Text> : null}
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <View style={s.backdrop}>
      <Stack.Screen options={{ headerShown: false }} />
      {WEB && <Pressable accessibilityRole="button" accessibilityLabel="Close compare" style={{ flex: 1 }} onPress={() => router.back()} />}
      <View style={s.sheet}>
        {WEB && <View style={s.grabber} />}
        <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
          <Text style={s.title} accessibilityRole="header">
            Field notebook — compare
          </Text>
          <View>
            <View style={s.divider} />
            <View style={s.cols}>
              {[ta, tb].map((x) => (
                <View key={x.taxonId} style={s.col}>
                  <View>
                    <SpeciesPhoto taxon={x} size={160} aspect={4 / 3} />
                    {x.dangerous && (
                      <View style={s.venom}>
                        <Tag label="VENOMOUS" venomous />
                      </View>
                    )}
                  </View>
                  <PhotoCredit taxon={x} style={{ marginTop: 4 }} />
                  <Text style={s.name}>{x.scientificName}</Text>
                </View>
              ))}
            </View>
            <View style={s.rows}>
              {rows.map((r) => (
                <View key={r.label} style={s.cols}>
                  {[r.a, r.b].map((v, i) => (
                    <View key={i} style={s.col} accessibilityLabel={`${r.label}: ${v.replace(/\n/g, ', ')}${r.differ ? '. Tells them apart.' : ''}`}>
                      <View style={s.label}>
                        <Icon name={r.icon} size={18} color={t.ink2} strokeWidth={1.75} />
                        <Text style={s.labelText}>{r.label}</Text>
                      </View>
                      {cell(v, r.differ)}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
          <View style={s.legend}>
            <Icon name="info" size={18} color={t.ink2} />
            <Text style={s.legendText}>
              {anyDiffer
                ? 'Values in green don’t overlap, so they tell these two apart.'
                : 'These counts overlap, so they can’t tell these two apart. Check another trait, or use the Scale key.'}
            </Text>
          </View>
        </ScrollView>
        {forId && (
          <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <Pair>
              <Button
                size={56}
                compact
                style={{ flex: 1, paddingHorizontal: 12 }}
                label={
                  <>
                    Choose <Text style={{ fontStyle: 'italic' }}>{ta.scientificName}</Text>
                  </>
                }
                onPress={() => pick(ta)}
              />
              <Button
                size={56}
                compact
                kind="outline"
                style={{ flex: 1, paddingHorizontal: 12 }}
                label={
                  <>
                    Choose <Text style={{ fontStyle: 'italic' }}>{tb.scientificName}</Text>
                  </>
                }
                onPress={() => pick(tb)}
              />
            </Pair>
          </View>
        )}
      </View>
    </View>
  );
}
