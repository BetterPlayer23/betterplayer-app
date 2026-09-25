import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes } from 'firebase/storage';

import { SCREENSHOT_MAX_BYTES, SCREENSHOT_TYPES } from '@shared/games';

import { storage } from '@/firebase';

export type PickedImage = { uri: string; mimeType: string; fileName: string };

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

function guessType(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType.toLowerCase();
  const ext = (asset.fileName ?? asset.uri).split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

// Opens the camera or the photo library. Returns null if the player cancels.
// Throws a plain-language Error when permission is refused.
export async function pickImage(source: 'camera' | 'library'): Promise<PickedImage | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Allow camera access in Settings to take a photo.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const mimeType = guessType(asset);
  if (!SCREENSHOT_TYPES.includes(mimeType)) {
    throw new Error('Use a JPEG, PNG, WebP or HEIC image.');
  }
  if (asset.fileSize && asset.fileSize > SCREENSHOT_MAX_BYTES) {
    throw new Error('That image is over 10 MB. Try a smaller screenshot.');
  }
  return { uri: asset.uri, mimeType, fileName: asset.fileName ?? 'screenshot' };
}

// Uploads into results/{matchId}/{uid}/ and returns the storage path.
export async function uploadResultImage(
  matchId: string,
  uid: string,
  image: PickedImage,
): Promise<string> {
  const blob = await (await fetch(image.uri)).blob();
  if (blob.size > SCREENSHOT_MAX_BYTES) {
    throw new Error('That image is over 10 MB. Try a smaller screenshot.');
  }
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[image.mimeType] ?? 'jpg'}`;
  const path = `results/${matchId}/${uid}/${name}`;
  try {
    await uploadBytes(ref(storage, path), blob, { contentType: image.mimeType });
  } catch {
    throw new Error('Couldn’t upload the screenshot. Check your connection and try again.');
  }
  return path;
}
