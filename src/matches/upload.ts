import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { ref, uploadBytes } from 'firebase/storage';

import { SCREENSHOT_MAX_BYTES, SCREENSHOT_TYPES } from '@shared/games';

import { storage } from '@/firebase';

export type PickedImage = { uri: string; mimeType: string; fileName: string };

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const TOO_BIG = 'That photo is over 10 MB. Take it again.';
const WRONG_TYPE = 'That photo format isn’t supported. Take it again with the camera.';

// Web: a file input that asks the phone to open the back camera directly
// (accept="image/*" capture="environment"); no photo library.
function takePhotoWeb(): Promise<PickedImage | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    const done = () => input.remove();
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      done();
      if (!file) return resolve(null);
      const mimeType = file.type.toLowerCase() || 'image/jpeg';
      if (!SCREENSHOT_TYPES.includes(mimeType)) return reject(new Error(WRONG_TYPE));
      if (file.size > SCREENSHOT_MAX_BYTES) return reject(new Error(TOO_BIG));
      resolve({ uri: URL.createObjectURL(file), mimeType, fileName: file.name || 'photo' });
    });
    input.addEventListener('cancel', () => {
      done();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

// Opens the camera (never the photo library). Returns null if the player
// cancels. Throws a plain-language Error when permission is refused.
// Native apps use the system camera for now (expo-camera later).
export async function takePhoto(): Promise<PickedImage | null> {
  if (Platform.OS === 'web') return takePhotoWeb();
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Allow camera access in Settings to take a photo.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const mimeType = asset.mimeType?.toLowerCase() || 'image/jpeg';
  if (!SCREENSHOT_TYPES.includes(mimeType)) throw new Error(WRONG_TYPE);
  if (asset.fileSize && asset.fileSize > SCREENSHOT_MAX_BYTES) throw new Error(TOO_BIG);
  return { uri: asset.uri, mimeType, fileName: asset.fileName ?? 'photo' };
}

// Uploads into results/{matchId}/{uid}/ and returns the storage path.
export async function uploadResultImage(
  matchId: string,
  uid: string,
  image: PickedImage,
): Promise<string> {
  const blob = await (await fetch(image.uri)).blob();
  if (blob.size > SCREENSHOT_MAX_BYTES) {
    throw new Error(TOO_BIG);
  }
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[image.mimeType] ?? 'jpg'}`;
  const path = `results/${matchId}/${uid}/${name}`;
  try {
    await uploadBytes(ref(storage, path), blob, { contentType: image.mimeType });
  } catch {
    throw new Error('Couldn’t upload the photo. Check your connection and try again.');
  }
  return path;
}
