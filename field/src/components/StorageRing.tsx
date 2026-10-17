// Phone storage as a ring (design pick S1, first screen; Jack: "the percentage used"): Fieldkit (ink), other apps
// (storage grey), free (mint, Mint Means Good), the % used large in the middle, and how many more survey days fit at
// this phone's rate. On Profile the whole card opens Storage check.
import { useMemo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { bytesWord, phoneStorage } from '@/lib/storage';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

import { Icon } from './Icon';

const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A storage drive in the kit's 24-grid stroke: slanted top, body, a slot and a light (the sprite has none). */
function Drive({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 13.5l2.4-6.4A2.2 2.2 0 0 1 8.5 5.6h7a2.2 2.2 0 0 1 2.1 1.5l2.4 6.4" />
      <Rect x={3.5} y={13.5} width={17} height={6} rx={1.8} />
      <Path d="M7 16.5h5M16.8 16.5h.01" />
    </Svg>
  );
}

export function StorageRing({ onPress }: { onPress?: () => void }) {
  const { t } = useTheme();
  // Measured once per visit: sizing the documents folder walks every photo.
  const st = useMemo(() => phoneStorage(), []);
  const card = { backgroundColor: t.card, borderRadius: radius.card, paddingTop: 14, paddingBottom: 16, paddingHorizontal: 16, gap: 12 };
  const titleRow = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 }}>
      <Text style={[type.body, { fontWeight: '500', color: t.ink, flex: 1 }]}>Phone storage</Text>
      {onPress && <Icon name="chev" size={16} color={t.ink2} strokeWidth={2.25} />}
    </View>
  );
  const wrap = (label: string, body: ReactNode) =>
    onPress ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Opens Storage check.`} onPress={onPress} style={({ pressed }) => [card, pressed && { backgroundColor: t.secPress }]}>
        {body}
      </Pressable>
    ) : (
      <View accessibilityLabel={label} style={card}>
        {body}
      </View>
    );

  if (!st) {
    return wrap(
      'Phone storage: this phone did not report its space',
      <>
        {titleRow}
        <Text style={[type.sub, { color: t.ink2 }]}>This phone did not report its space.</Text>
      </>,
    );
  }

  // Free space is mint in day and night (night's onFill is too dark to read on the night card).
  const freeColor = t.name === 'night' ? t.onInk : t.onFill;
  const size = 208;
  const stroke = 30;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Fieldkit's slice is often tiny: draw it as a wedge of at least 2.5 % (the legend keeps the real size). The used
  // arc as a whole still matches the % in the middle; only the split between Fieldkit and other apps is nudged.
  const usedFrac = Math.min(1, (st.app + st.other) / st.total);
  const appFrac = st.app > 0 ? Math.min(usedFrac, Math.max(st.app / st.total, 0.025)) : 0;
  const otherFrac = Math.max(0, usedFrac - appFrac);
  const room = st.daysOfRoom > 1000 ? 'Room for 1,000+ more survey days' : `Room for about ${thousands(st.daysOfRoom)} more survey days`;
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
      <Text style={[type.body, { color: t.ink, flex: 1 }]}>{label}</Text>
      <Text style={[type.body, { color: t.ink }]}>{value}</Text>
    </View>
  );
  return wrap(
    `Phone storage: ${st.usedPct}% used. Fieldkit ${bytesWord(st.app)}, other apps ${bytesWord(st.other)}, free ${bytesWord(st.free)}. ${room}`,
    <>
      {titleRow}
      <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 4 }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {seg(1, 0, freeColor, 'free')}
          {seg(otherFrac, appFrac, t.storageOther, 'other')}
          {seg(appFrac, 0, t.ink, 'app')}
        </Svg>
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <Text style={{ fontSize: 48, lineHeight: 54, fontWeight: '700', letterSpacing: -1.2, color: t.ink, fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1}>
            {st.usedPct}
            <Text style={{ fontSize: 28, fontWeight: '600', letterSpacing: 0 }}>%</Text>
          </Text>
          <Text style={{ fontSize: 18, lineHeight: 22, fontWeight: '400', color: t.ink, marginTop: -2 }} maxFontSizeMultiplier={1}>
            used
          </Text>
        </View>
      </View>
      <View>
        {legend(t.ink, 'Fieldkit', bytesWord(st.app))}
        {legend(t.storageOther, 'Other apps', bytesWord(st.other))}
        {legend(freeColor, 'Free', bytesWord(st.free))}
      </View>
      <View style={{ height: 1, backgroundColor: t.hair }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Drive color={t.ink} />
        <Text style={[type.sub, { color: t.ink, flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          {room}
        </Text>
      </View>
    </>,
  );
}

/** The quiet line under the ring card, inside the "This phone" group (comp S1). */
export function NeverDeletes() {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8 }}>
      <Icon name="info" size={18} color={t.ink2} strokeWidth={1.6} />
      <Text style={[type.sub, { color: t.ink2, flex: 1 }]}>Fieldkit never deletes anything on its own</Text>
    </View>
  );
}
