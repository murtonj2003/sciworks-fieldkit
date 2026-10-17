// A species' photo from the pack (CC BY / CC0, credited on the notebook page). Shown from the phone's image
// cache once it has been seen online; with no signal and no cached copy, a quiet grey disc with the snake icon.
import type { Taxon } from '@sciworks/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View } from 'react-native';

import { photoOf } from '@/lib/speciesGuide';
import { useTheme } from '@/theme/ThemeProvider';

import { Icon } from './Icon';

export function SpeciesPhoto({ taxon, size = 64, round = true, width }: { taxon: Taxon; size?: number; round?: boolean; width?: number | `${number}%` }) {
  const { t } = useTheme();
  const [failed, setFailed] = useState(false);
  const p = photoOf(taxon);
  const box = { width: width ?? size, height: size, borderRadius: round ? size / 2 : 12, backgroundColor: t.tile, overflow: 'hidden' as const };
  if (!p?.url || failed) {
    return (
      <View style={[box, { alignItems: 'center', justifyContent: 'center' }]} accessibilityElementsHidden importantForAccessibility="no">
        <Icon name="snake" size={Math.round(size * 0.42)} color={t.ink2} strokeWidth={1.75} />
      </View>
    );
  }
  return (
    <View style={box}>
      <Image
        source={{ uri: p.url }}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        cachePolicy="disk"
        transition={120}
        onError={() => setFailed(true)}
        accessibilityLabel={`Photo of ${taxon.scientificName}`}
      />
    </View>
  );
}
