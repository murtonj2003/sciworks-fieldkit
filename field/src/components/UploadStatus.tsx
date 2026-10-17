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

/** The small status dot at the end of a transect row on Home (comp 1D): the last walk's tier, or a hollow ring
 * when the transect hasn't been walked on this phone. */
export function TierDot({ tier }: { tier: UploadTier | null }) {
  const { t } = useTheme();
  if (!tier) return <View accessibilityLabel="Not walked yet" style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: t.track }} />;
  return (
    <View
      accessibilityLabel={tier === 'phone' ? 'Last walk only on this phone' : tier === 'sent' ? 'Last walk sent, waiting for HQ' : 'Last walk confirmed by HQ'}
      style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tierColors(tier, t).mark }}
    />
  );
}

/** "On phone" / "Sent" / "HQ ✓" (drawn tick). */
export function TierTag({ tier }: { tier: UploadTier }) {
  const { t } = useTheme();
  const c = tierColors(tier, t);
  return (
    <View
      accessibilityLabel={tier === 'phone' ? 'Only on this phone' : tier === 'sent' ? 'Sent, waiting for HQ' : 'Confirmed by HQ'}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 24, paddingHorizontal: 8, borderRadius: radius.tag, backgroundColor: c.bg }}
    >
      <Text style={[type.small, { fontWeight: '600', color: c.fg }]}>{TIER_WORD[tier]}</Text>
      {tier === 'hq' && <Icon name="check" size={12} color={c.fg} strokeWidth={2.5} />}
    </View>
  );
}

/** "1 on phone · 3 sent · 12 confirmed" in each tier's own ink over a thin red / amber / green bar (comp 2B). */
export function UploadStrip({ counts }: { counts: Record<UploadTier, number> }) {
  const { t } = useTheme();
  const total = counts.phone + counts.sent + counts.hq;
  const parts: { tier: UploadTier; n: number; word: string }[] = [
    { tier: 'phone', n: counts.phone, word: 'on phone' },
    { tier: 'sent', n: counts.sent, word: 'sent' },
    { tier: 'hq', n: counts.hq, word: 'confirmed' },
  ];
  // Words in the tier's dark ink (red, amber, green); the bar uses the brighter marks.
  const word = (tier: UploadTier) => (tier === 'phone' ? t.offTintInk : tier === 'sent' ? t.nearInk : t.onInk);
  return (
    <View style={{ gap: 6, marginHorizontal: 4 }} accessibilityLabel={parts.map((p) => `${p.n} ${p.word}`).join(', ')}>
      <Text style={[type.sub, { color: t.ink2 }]}>
        {parts.map((p, i) => (
          <Text key={p.tier}>
            {i > 0 ? '  ·  ' : ''}
            <Text style={{ color: word(p.tier), fontWeight: '600' }}>
              {p.n} {p.word}
            </Text>
          </Text>
        ))}
      </Text>
      <View style={{ flexDirection: 'row', height: 3, borderRadius: 2, overflow: 'hidden', gap: 2 }}>
        {total === 0 && <View style={{ flex: 1, backgroundColor: t.track }} />}
        {parts
          .filter((p) => p.n > 0)
          .map((p) => (
            <View key={p.tier} style={{ flex: p.n, backgroundColor: tierColors(p.tier, t).mark }} />
          ))}
      </View>
    </View>
  );
}
