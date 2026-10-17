// Phone storage as a ring (design pick S1): Fieldkit (ink), everything else (grey), free (mint, Mint Means
// Good), the % used in the middle, and how many more survey days fit at this phone's rate.
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { bytesWord, phoneStorage } from '@/lib/storage';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

import { Icon } from './Icon';

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function StorageRing() {
  const { t } = useTheme();
  const st = phoneStorage();
  if (!st) return null;
  const size = 168;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Fieldkit's slice is often tiny: keep it visible (at least a sliver) without lying about the legend numbers.
  const appFrac = Math.max(st.app / st.total, st.app > 0 ? 0.012 : 0);
  const otherFrac = Math.max(0, st.other / st.total);
  const seg = (frac: number, offsetFrac: number, color: string, key: string) => (
    <Circle
      key={key}
      cx={size / 2}
      cy={size / 2}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeDasharray={`${c * frac} ${c}`}
      strokeDashoffset={-c * offsetFrac}
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
    />
  );
  const legend = (color: string, label: string, value: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      <Text style={[type.sub, { color: t.ink, flex: 1 }]}>{label}</Text>
      <Text style={[type.sub, { color: t.ink, fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  );
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.card, padding: 14, gap: 12 }} accessibilityLabel={`Phone storage ${st.usedPct}% used, ${bytesWord(st.free)} free`}>
      <Text style={[type.title, { color: t.ink }]}>Phone storage</Text>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {seg(1, 0, t.onFill, 'free')}
          {seg(otherFrac, appFrac, t.track, 'other')}
          {seg(appFrac, 0, t.ink, 'app')}
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <Text style={[type.display, { color: t.ink, fontVariant: ['tabular-nums'] }]}>{st.usedPct}%</Text>
          <Text style={[type.sub, { color: t.ink2 }]}>used</Text>
        </View>
      </View>
      <View>
        {legend(t.ink, 'Fieldkit', bytesWord(st.app))}
        {legend(t.track, 'Other apps', bytesWord(st.other))}
        {legend(t.onFill, 'Free', bytesWord(st.free))}
      </View>
      <View style={{ height: 1, backgroundColor: t.hair }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="folder" size={20} color={t.ink} />
        <Text style={[type.sub, { color: t.ink, flex: 1 }]}>
          {st.daysOfRoom > 1000 ? 'Room for more than 1,000 more survey days' : `Room for about ${thousands(st.daysOfRoom)} more survey days`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <Icon name="info" size={18} color={t.ink2} />
        <Text style={[type.small, { fontWeight: '400', color: t.ink2, flex: 1, lineHeight: 18 }]}>
          Fieldkit never deletes anything on its own. Hand over to HQ, then HQ decides what to archive.
        </Text>
      </View>
    </View>
  );
}
