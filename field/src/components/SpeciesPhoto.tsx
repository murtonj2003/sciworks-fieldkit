// A species' photo. First choice: the small CC BY / CC0 photo HQ sent in the bundle and the phone saved
// (db/speciesPhotos.ts), so it shows in airplane mode. Only a species with no saved photo (or one whose file
// won't open) falls back to the pack's online iNaturalist link, shown from the image cache once seen. With
// neither, a quiet grey box with the snake icon, which also sits under the photo while it loads. Wherever a photo
// shows, its credit shows too (PhotoCredit).
import type { Taxon } from '@sciworks/shared';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { speciesPhotoFile, type StoredSpeciesPhoto } from '@/db/speciesPhotos';
import { photoChoices } from '@/lib/speciesGuide';
import { useField } from '@/state/field';
import { useTheme } from '@/theme/ThemeProvider';
import { type } from '@/theme/theme';

import { Icon } from './Icon';

/** iNaturalist open data keeps smaller copies beside the original: use the one the slot needs. */
const sized = (url: string, size: number) =>
  url.replace(/\/original\.(jpe?g|png)$/i, size <= 96 ? '/small.$1' : size <= 200 ? '/medium.$1' : '/large.$1');

const webUris = new Map<string, string>();
/** Phones load the saved JPEG by its file address; the dev-only browser preview has no files, so it gets a data URI. */
function savedUri(p: StoredSpeciesPhoto): string {
  const f = speciesPhotoFile(p);
  if (Platform.OS !== 'web') return f.uri;
  let u = webUris.get(p.path);
  if (!u) {
    u = `data:image/jpeg;base64,${(f as unknown as { base64Sync: () => string }).base64Sync()}`;
    webUris.set(p.path, u);
  }
  return u;
}

export interface PhotoSource {
  uri: string;
  /** "Rachel Lee Harper · CC BY 4.0 · via iNaturalist / GBIF": shown wherever the photo is. */
  credit: string;
  /** true = saved on the phone (works offline); false = the online fallback. */
  saved: boolean;
}

/** Where a species' photo can come from, best first: the one saved from HQ, then the pack's online link. */
export function useSpeciesPhotos(taxon: Taxon, size = 64): PhotoSource[] {
  const { speciesPhotos } = useField();
  const stored = speciesPhotos[taxon.taxonId];
  return useMemo(
    () =>
      photoChoices(taxon, stored).map((c) =>
        c.kind === 'saved' ? { uri: savedUri(stored!), credit: c.credit, saved: true } : { uri: sized(c.url, size), credit: c.credit, saved: false },
      ),
    [stored, taxon, size],
  );
}

/** "Photo: Rachel Lee Harper · CC BY 4.0 · via iNaturalist / GBIF", small and quiet, never cut short; nothing
 * when there's no photo.
 * `onImage` = white words with a soft shadow, laid over the photo itself. */
export function PhotoCredit({ taxon, style, onImage }: { taxon: Taxon; style?: StyleProp<TextStyle>; onImage?: boolean }) {
  const { t } = useTheme();
  const src = useSpeciesPhotos(taxon)[0];
  if (!src) return null;
  return (
    <Text
      style={[
        type.micro,
        { lineHeight: 15, color: t.ink2 },
        onImage && { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0.5 } },
        style,
      ]}
    >
      Photo: {src.credit}
    </Text>
  );
}

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
  const sources = useSpeciesPhotos(taxon, aspect ? Math.max(size, 240) : size);
  const [failed, setFailed] = useState<string[]>([]);
  const src = sources.find((x) => !failed.includes(x.uri));
  const box = aspect
    ? { width: '100%' as const, aspectRatio: aspect, borderRadius: 12, backgroundColor: t.tile, overflow: 'hidden' as const }
    : { width: width ?? size, height: size, borderRadius: round ? size / 2 : 12, backgroundColor: t.tile, overflow: 'hidden' as const };
  const glyph = <Icon name="snake-coil" size={Math.round(Math.min(size, 120) * (round && !aspect && size <= 72 ? 0.52 : 0.38))} color={t.ink2} strokeWidth={1.5} />;
  return (
    <View style={[box, { alignItems: 'center', justifyContent: 'center' }]} accessibilityElementsHidden={!src} importantForAccessibility={src ? 'auto' : 'no'}>
      {glyph}
      {src && (
        <Image
          key={src.uri}
          source={{ uri: src.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy={src.saved ? 'none' : 'disk'}
          transition={120}
          onError={() => setFailed((f) => [...f, src.uri])}
          accessibilityLabel={`Photo of ${taxon.scientificName}`}
        />
      )}
    </View>
  );
}
