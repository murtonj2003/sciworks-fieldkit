// The counter (kit `.fk-counter`): always first on Home. "{N} records · {M} photos not with HQ" with tabular
// numbers and a "Last handover" line led by an amber dot (a mint tick when nothing is waiting, SHARED-CONTRACT §7.5).
// Home draws it as comp 1D's white card with the way into Hand over to HQ inside (Jack's pick, Sat 20:30).
import { Pressable, Text, View } from 'react-native';

import { daysAgo } from '@/lib/boot';
import { useField } from '@/state/field';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

import { Icon } from './Icon';
import { Group } from './ui';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** `totals` = the "… on this phone" totals after the handover time (Hand over to HQ hides them; Home's card
 * carries the Hand over row instead). `handover` = Home (comp 1D + Jack's pick): two big numbers over grey labels,
 * the handover line, then "Hand over to HQ ›"; the whole card opens it. */
export function CounterBar({ onPress, totals = true, handover }: { onPress?: () => void; totals?: boolean; handover?: boolean }) {
  const { counter } = useField();
  const { t } = useTheme();
  const safe = counter.recordsNotWithHq === 0 && counter.photosNotWithHq === 0;
  const label = `${counter.recordsNotWithHq} ${plural(counter.recordsNotWithHq, 'record', 'records')} and ${counter.photosNotWithHq} ${plural(counter.photosNotWithHq, 'photo', 'photos')} not with HQ`;
  const when = counter.lastHandoverAt ? `Last handover ${daysAgo(counter.lastHandoverAt)}` : 'No handover yet';
  const disc = (
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: safe ? t.onFill : t.nearFill, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={safe ? 'check' : 'up'} size={14} color={safe ? t.onInk : t.nearInk} strokeWidth={2.5} />
    </View>
  );

  if (handover) {
    const big = { fontSize: 40, lineHeight: 46, fontWeight: '700' as const, letterSpacing: -1, color: t.ink, fontVariant: ['tabular-nums' as const] };
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${when}. Opens Hand over to HQ.`}
        onPress={onPress}
        style={({ pressed }) => ({ backgroundColor: pressed ? t.secPress : t.card, borderRadius: radius.group, borderWidth: 1, borderColor: t.hair, overflow: 'hidden' })}
      >
        <View style={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 18 }}>
            <View style={{ minWidth: 92 }}>
              <Text style={big}>{counter.recordsNotWithHq}</Text>
              <Text style={[type.sub, { color: t.ink2 }]}>{plural(counter.recordsNotWithHq, 'record', 'records')}</Text>
            </View>
            <Text style={[type.title, { color: t.ink2, marginTop: 14 }]}>·</Text>
            <View style={{ flex: 1 }}>
              <Text style={big}>{counter.photosNotWithHq}</Text>
              <Text style={[type.sub, { color: t.ink2 }]}>{plural(counter.photosNotWithHq, 'photo', 'photos')} not with HQ</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {disc}
            <Text style={[type.sub, { color: t.ink2, flex: 1 }]}>{when}</Text>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: t.hair, marginLeft: 18 }} />
        <View style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 18, paddingRight: 14 }}>
          <Icon name="send" size={20} color={t.ink} />
          <Text style={[type.title, { color: t.ink, flex: 1 }]}>Hand over to HQ</Text>
          <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />
        </View>
      </Pressable>
    );
  }

  const ink = safe ? t.onInk : t.ink;
  const sub = safe ? t.onInk : t.ink2;
  const num = { ...type.numeral, color: ink };
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
          {when}
          {totals
            ? ` · ${counter.totalRecords} ${plural(counter.totalRecords, 'record', 'records')} and ${counter.totalPhotos} ${plural(counter.totalPhotos, 'photo', 'photos')} on this phone`
            : ''}
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
