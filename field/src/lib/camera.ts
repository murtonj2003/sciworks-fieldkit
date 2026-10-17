// Take or pick a photo, shrink it to a long edge of at most 2048 px, JPEG. Returns the bytes to store.
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export interface ShotResult {
  bytes: Uint8Array;
  width: number;
  height: number;
}

const MAX_EDGE = 2048;

async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<ShotResult> {
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_EDGE) {
    ctx.resize(asset.width >= asset.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const bytes = await new File(saved.uri).bytes();
  return { bytes, width: saved.width, height: saved.height };
}

export async function takePhoto(): Promise<ShotResult | { error: string } | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { error: 'The camera is not allowed. Turn it on in the phone settings.' };
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  return shrink(res.assets[0]);
}

export async function pickPhoto(): Promise<ShotResult | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  return shrink(res.assets[0]);
}
