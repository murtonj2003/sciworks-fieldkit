// Always visible: how much is on this phone that HQ hasn't confirmed (SHARED-CONTRACT §7.5).
import { StyleSheet, Text, View } from 'react-native';

import { daysAgo } from '@/lib/boot';
import { useField } from '@/state/field';

import { colors } from './ui';

export function CounterBar() {
  const { counter } = useField();
  const allSafe = counter.recordsNotWithHq === 0 && counter.photosNotWithHq === 0;
  return (
    <View style={[styles.bar, allSafe ? styles.safe : styles.pending]} accessibilityRole="summary">
      <Text style={styles.main}>
        {allSafe ? '✓ ' : '● '}
        {counter.recordsNotWithHq} records · {counter.photosNotWithHq} photos not with HQ
      </Text>
      <Text style={styles.sub}>
        Last handover {daysAgo(counter.lastHandoverAt)} · {counter.totalRecords} records and {counter.totalPhotos} photos on
        this phone
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: 12, padding: 14, gap: 4, borderWidth: 2 },
  pending: { borderColor: colors.amber, backgroundColor: '#FFF7E6' },
  safe: { borderColor: colors.green, backgroundColor: '#ECF7EF' },
  main: { fontSize: 18, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 15, color: colors.dim },
});
