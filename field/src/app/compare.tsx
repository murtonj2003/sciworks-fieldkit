// Field notebook · compare two look-alikes side by side (design pick 4C). One row per trait from the pack;
// a count whose ranges don't overlap is marked in mint, because that is a real way to tell them apart.
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { SpeciesPhoto } from '@/components/SpeciesPhoto';
import { BottomBar, Button, T, Tag } from '@/components/ui';
import { compareRows } from '@/lib/speciesGuide';
import { chooseTaxon } from '@/model/chooseTaxon';
import { useField } from '@/state/field';
import { makeStyles } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.ground },
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  cols: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, gap: 8 },
  name: { ...type.title, fontStyle: 'italic', color: t.ink },
  card: { backgroundColor: t.card, borderRadius: radius.card, padding: 12, gap: 12, marginTop: 12 },
  rowLabel: { ...type.small, fontWeight: '600', color: t.ink2 },
  cell: { ...type.sub, color: t.ink, fontVariant: ['tabular-nums'] },
  differ: { alignSelf: 'flex-start', backgroundColor: t.onFill, borderRadius: radius.tag, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  differText: { ...type.sub, fontWeight: '600', color: t.onInk, fontVariant: ['tabular-nums'] },
  legend: { ...type.small, fontWeight: '400', color: t.ink2, marginTop: 10, marginHorizontal: 4 },
}));

export default function Compare() {
  const { a, b, for: forId } = useLocalSearchParams<{ a: string; b: string; for?: string }>();
  const { pack, project } = useField();
  const s = useStyles();
  const ta = pack?.taxa.find((x) => x.taxonId === a);
  const tb = pack?.taxa.find((x) => x.taxonId === b);
  if (!ta || !tb) return <T>These species are not in the pack on this phone.</T>;
  const rows = compareRows(ta, tb);
  const pick = (x: typeof ta) => {
    if (!forId) return;
    chooseTaxon(forId, x, project?.timeZone);
    router.dismissTo({ pathname: '/encounter/[id]', params: { id: forId } });
  };
  const cell = (text: string, differ: boolean) =>
    differ ? (
      <View style={s.differ}>
        <Text style={s.differText}>{text}</Text>
      </View>
    ) : (
      <Text style={s.cell}>{text}</Text>
    );

  return (
    <View style={s.wrap}>
      <Stack.Screen options={{ title: 'Compare look-alikes' }} />
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.cols}>
          {[ta, tb].map((x) => (
            <View key={x.taxonId} style={s.col}>
              <SpeciesPhoto taxon={x} size={130} round={false} width="100%" />
              <Text style={s.name}>{x.scientificName}</Text>
              {x.dangerous && <Tag label="VENOMOUS" venomous />}
            </View>
          ))}
        </View>
        <View style={s.card}>
          {rows.map((r) => (
            <View key={r.label} style={{ gap: 4 }}>
              <Text style={s.rowLabel}>{r.label}</Text>
              <View style={s.cols}>
                <View style={s.col}>{cell(r.a, r.differ)}</View>
                <View style={s.col}>{cell(r.b, r.differ)}</View>
              </View>
            </View>
          ))}
        </View>
        <Text style={s.legend}>Marked in green: the counts don't overlap, so this tells them apart.</Text>
      </ScrollView>
      {forId && (
        <BottomBar>
          <Button
            size={56}
            label={
              <>
                Choose <Text style={{ fontStyle: 'italic' }}>{ta.scientificName}</Text>
              </>
            }
            onPress={() => pick(ta)}
          />
          <Button
            size={56}
            kind="grey"
            label={
              <>
                Choose <Text style={{ fontStyle: 'italic' }}>{tb.scientificName}</Text>
              </>
            }
            onPress={() => pick(tb)}
          />
        </BottomBar>
      )}
    </View>
  );
}
