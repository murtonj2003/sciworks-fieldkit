// A species' photo from the pack (CC BY / CC0, credited on the notebook page). Shown from the phone's image
// cache once it has been seen online; with no signal and no cached copy, a quiet grey box with the snake icon,
// which also sits under the photo while it loads (so loading never looks like an empty grey slab).
import type { Taxon } from '@sciworks/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { photoOf } from '@/lib/speciesGuide';
import { useTheme } from '@/theme/ThemeProvider';

import { Icon } from './Icon';

/** iNaturalist open data keeps smaller copies beside the original: use the one the slot needs. */
const sized = (url: string, size: number) =>
  url.replace(/\/original\.(jpe?g|png)$/i, size <= 96 ? '/small.$1' : size <= 200 ? '/medium.$1' : '/large.$1');

export function SpeciesPhoto({
  taxon,
  size = 64,
  round = true,
  width,
  aspect,
}: {
  taxon: Taxon;
  /** Height in points (and width, unless `width` or `aspect` is given). */
  size?: number;
  round?: boolean;
  width?: number | `${number}%`;
  /** Full width at this width ÷ height, e.g. 4 / 3 (compare, notebook). `size` then only picks the copy. */
  aspect?: number;
}) {
  const { t } = useTheme();
  const [failed, setFailed] = useState(false);
  const p = photoOf(taxon);
  const box = aspect
    ? { width: '100%' as const, aspectRatio: aspect, borderRadius: 12, backgroundColor: t.tile, overflow: 'hidden' as const }
    : { width: width ?? size, height: size, borderRadius: round ? size / 2 : 12, backgroundColor: t.tile, overflow: 'hidden' as const };
  const glyph = <Icon name="snake-coil" size={Math.round(Math.min(size, 120) * (round && !aspect && size <= 72 ? 0.52 : 0.38))} color={t.ink2} strokeWidth={1.5} />;
  return (
    <View style={[box, { alignItems: 'center', justifyContent: 'center' }]} accessibilityElementsHidden={!p?.url || failed} importantForAccessibility={!p?.url || failed ? 'no' : 'auto'}>
      {glyph}
      {p?.url && !failed && (
        <Image
          source={{ uri: sized(p.url, aspect ? Math.max(size, 240) : size) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
          transition={120}
          onError={() => setFailed(true)}
          accessibilityLabel={`Photo of ${taxon.scientificName}`}
        />
      )}
    </View>
  );
}
