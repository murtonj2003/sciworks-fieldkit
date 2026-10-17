// Floating black pill navigation (design pick 2B; Library app-shell pattern "floating pill nav over content"):
// Survey · Add animal (white disc, the app's main verb) · Profile. Inset from the edges; content scrolls under.
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, type } from '@/theme/theme';

import { Icon } from './Icon';
import type { IconName } from './sprite';

/** Space to leave at the bottom of a scroll view so its last row clears the pill. */
export const NAV_PILL_CLEARANCE = 112;

export function NavPill({
  active,
  onSurvey,
  onAdd,
  onProfile,
  addLabel = 'Add animal',
}: {
  active?: 'survey' | 'profile';
  onSurvey: () => void;
  onAdd: () => void;
  onProfile: () => void;
  addLabel?: string;
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  // The pill is ink on day, and the lifted grey on night, so it never disappears into the ground.
  const fill = t.name === 'night' ? '#3A3A3C' : t.pri;
  const night = t.name === 'night';
  const fg = night ? t.ink : '#FFFFFF';
  const item = (key: 'survey' | 'profile', icon: IconName, label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active === key }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, opacity: pressed ? 0.7 : 1, minHeight: 56 })}
    >
      <Icon name={icon} size={28} color={fg} strokeWidth={1.6} />
      <Text style={[type.small, { fontSize: 13, fontWeight: '600', color: fg }]}>{label}</Text>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: active === key ? fg : 'transparent' }} />
    </Pressable>
  );
  const lift = Math.max(insets.bottom, 12) + 4;
  return (
    <>
      {/* A soft fade of the page colour behind the pill, so rows scrolling under it don't clash with it. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: lift + 104 }}>
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
          <Defs>
            <LinearGradient id="navfade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={t.ground} stopOpacity={0} />
              <Stop offset="0.55" stopColor={t.ground} stopOpacity={0.92} />
              <Stop offset="1" stopColor={t.ground} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="10" height="10" fill="url(#navfade)" />
        </Svg>
      </View>
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: lift }}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 76,
          paddingHorizontal: 10,
          borderRadius: radius.pill,
          backgroundColor: fill,
          shadowColor: '#1D1E1F',
          shadowOpacity: t.name === 'day' ? 0.18 : 0,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        {item('survey', 'survey', 'Survey', onSurvey)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          onPress={onAdd}
          style={({ pressed }) => ({ flex: 1.2, alignItems: 'center', justifyContent: 'center', gap: 3, transform: [{ scale: pressed ? 0.96 : 1 }] })}
        >
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: night ? t.pri : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={26} color={night ? t.onPri : '#1D1E1F'} strokeWidth={2.25} />
          </View>
          <Text style={[type.small, { fontSize: 13, fontWeight: '600', color: fg }]}>{addLabel}</Text>
        </Pressable>
        {item('profile', 'user', 'Profile', onProfile)}
      </View>
    </View>
    </>
  );
}
