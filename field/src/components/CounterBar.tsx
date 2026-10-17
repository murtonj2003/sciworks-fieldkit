// The counter (kit `.fk-counter`): always first on Home. "{N} records · {M} photos not with HQ" with 26 px tabular
// numbers and a "Last handover" line led by an amber dot; it turns mint with a tick only when nothing is waiting
// (SHARED-CONTRACT §7.5).
import { Pressable, Text, View } from 'react-native';

import { daysAgo } from '@/lib/boot';
import { useField } from '@/state/field';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

import { Icon } from './Icon';
import { Group } from './ui';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function CounterBar({ onPress }: { onPress?: () => void }) {
  const { counter } = useField();
  const { t } = useTheme();
  const safe = counter.recordsNotWithHq === 0 && counter.photosNotWithHq === 0;
  const ink = safe ? t.onInk : t.ink;
  const sub = safe ? t.onInk : t.ink2;
  const num = { ...type.numeral, color: ink };
  const label = `${counter.recordsNotWithHq} ${plural(counter.recordsNotWithHq, 'record', 'records')} and ${counter.photosNotWithHq} ${plural(counter.photosNotWithHq, 'photo', 'photos')} not with HQ`;
  const body = (
    <View style={{ backgroundColor: safe ? t.onFill : t.card, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text style={[type.body, { color: ink, lineHeight: 30 }]}>
        <Text style={num}>{counter.recordsNotWithHq}</Text> {plural(counter.recordsNotWithHq, 'record', 'records')} ·{' '}
        <Text style={num}>{counter.photosNotWithHq}</Text> {plural(counter.photosNotWithHq, 'photo', 'photos')} not with HQ
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6 }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: safe ? t.onInk : t.nearFill,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: -1,
          }}
        >
          <Icon name={safe ? 'check' : 'up'} size={14} color={safe ? t.onFill : t.nearInk} strokeWidth={2.5} />
        </View>
        <Text style={[type.sub, { color: sub, flex: 1 }]}>
          {counter.lastHandoverAt ? `Last handover ${daysAgo(counter.lastHandoverAt)}` : 'No handover yet'} · {counter.totalRecords} {plural(counter.totalRecords, 'record', 'records')} and{' '}
          {counter.totalPhotos} {plural(counter.totalPhotos, 'photo', 'photos')} on this phone
        </Text>
      </View>
    </View>
  );
  return (
    <Group>
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Opens Hand over to HQ.`} onPress={onPress}>
          {body}
        </Pressable>
      ) : (
        <View accessibilityRole="summary" accessibilityLabel={label}>
          {body}
        </View>
      )}
    </Group>
  );
}
