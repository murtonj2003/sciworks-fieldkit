// Floating black pill navigation (design pick 2B; Library app-shell pattern "floating pill nav over content"):
// Survey · Add animal (white disc, the app's main verb) · Profile. Inset from the edges; content scrolls under.
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const fg = '#FFFFFF';
  const item = (key: 'survey' | 'profile', icon: IconName, label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active === key }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, opacity: pressed ? 0.7 : 1, minHeight: 56 })}
    >
      <Icon name={icon} size={24} color={fg} strokeWidth={2} />
      <Text style={[type.small, { fontSize: 12, color: fg }]}>{label}</Text>
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: active === key ? fg : 'transparent' }} />
    </Pressable>
  );
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 4 }}>
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
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={26} color="#1D1E1F" strokeWidth={2.25} />
          </View>
          <Text style={[type.small, { fontSize: 12, fontWeight: '600', color: fg }]}>{addLabel}</Text>
        </Pressable>
        {item('profile', 'user', 'Profile', onProfile)}
      </View>
    </View>
  );
}
