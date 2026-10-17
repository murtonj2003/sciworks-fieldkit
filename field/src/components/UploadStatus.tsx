// Three-tier upload status (design pick 2B): a small tag on every survey and animal row, and a strip on Home.
// Tints only (never solid red: One Shout is the "Off the line" block). Words carry the meaning, colour backs it.
import { Text, View } from 'react-native';

import type { UploadTier } from '@/db/status';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

import { Icon } from './Icon';

export const TIER_WORD: Record<UploadTier, string> = { phone: 'On phone', sent: 'Sent', hq: 'HQ' };

function tierColors(tier: UploadTier, t: ReturnType<typeof useTheme>['t']) {
  return tier === 'phone' ? { bg: t.offTint, fg: t.offTintInk, mark: t.offMark } : tier === 'sent' ? { bg: t.nearFill, fg: t.nearInk, mark: t.nearMark } : { bg: t.onFill, fg: t.onInk, mark: t.onMark };
}

/** "On phone" / "Sent" / "HQ ✓" (drawn tick). */
export function TierTag({ tier }: { tier: UploadTier }) {
  const { t } = useTheme();
  const c = tierColors(tier, t);
  return (
    <View
      accessibilityLabel={tier === 'phone' ? 'Only on this phone' : tier === 'sent' ? 'Sent, waiting for HQ' : 'Confirmed by HQ'}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 22, paddingHorizontal: 7, borderRadius: radius.tag, backgroundColor: c.bg }}
    >
      <Text style={[type.small, { fontSize: 12, fontWeight: '600', color: c.fg }]}>{TIER_WORD[tier]}</Text>
      {tier === 'hq' && <Icon name="check" size={12} color={c.fg} strokeWidth={2.5} />}
    </View>
  );
}

/** "1 on phone · 3 sent · 12 confirmed" over a proportional red / amber / green bar. */
export function UploadStrip({ counts }: { counts: Record<UploadTier, number> }) {
  const { t } = useTheme();
  const total = counts.phone + counts.sent + counts.hq;
  if (total === 0) return null;
  const parts: { tier: UploadTier; n: number; word: string }[] = [
    { tier: 'phone', n: counts.phone, word: 'on phone' },
    { tier: 'sent', n: counts.sent, word: 'sent' },
    { tier: 'hq', n: counts.hq, word: 'confirmed' },
  ];
  return (
    <View style={{ gap: 6, marginHorizontal: 4 }} accessibilityLabel={parts.map((p) => `${p.n} ${p.word}`).join(', ')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 }}>
        {parts.map((p) => (
          <View key={p.tier} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tierColors(p.tier, t).mark }} />
            <Text style={[type.small, { color: t.ink }]}>
              <Text style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{p.n}</Text> {p.word}
            </Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', gap: 2 }}>
        {parts
          .filter((p) => p.n > 0)
          .map((p) => (
            <View key={p.tier} style={{ flex: p.n, backgroundColor: tierColors(p.tier, t).mark }} />
          ))}
      </View>
    </View>
  );
}
