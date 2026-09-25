import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, fonts } from '@/constants/theme';
import { takePhoto, type PickedImage } from '@/matches/upload';

// "Take photo" (opens the camera directly, no photo library), with a
// preview, Retake and Remove.
export function CameraField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  error?: string | null;
}) {
  const [cameraError, setCameraError] = useState<string | null>(null);

  async function open() {
    setCameraError(null);
    try {
      const image = await takePhoto();
      if (image) onChange(image);
    } catch (e) {
      setCameraError(e instanceof Error ? e.message : 'Couldn’t open the camera.');
    }
  }

  const shownError = cameraError ?? error;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: value.uri }} style={styles.preview} resizeMode="cover" />
          <View style={styles.links}>
            <Pressable accessibilityRole="button" onPress={open}>
              <Text style={styles.link}>Retake</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onChange(null)}>
              <Text style={styles.link}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Button label="Take photo" variant="outline" onPress={open} />
      )}
      {shownError && <Text style={styles.error}>{shownError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  previewWrap: {
    gap: 8,
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  links: {
    flexDirection: 'row',
    gap: 20,
  },
  link: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.accent,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.error,
  },
});
