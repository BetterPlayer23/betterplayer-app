import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { MIN_TOUCH, colors, fonts } from '@/constants/theme';
import { pickScreenshot, takePhoto, type PickedImage } from '@/matches/upload';

// "Take photo" (opens the camera directly), with a preview, Retake and Remove.
// With allowLibrary (games played on the phone), also "Choose screenshot".
export function CameraField({
  label,
  value,
  onChange,
  error,
  allowLibrary = false,
}: {
  label: string;
  allowLibrary?: boolean;
  value: PickedImage | null;
  onChange: (image: PickedImage | null) => void;
  error?: string | null;
}) {
  const [cameraError, setCameraError] = useState<string | null>(null);

  async function open(source: 'camera' | 'library' = 'camera') {
    setCameraError(null);
    try {
      const image = source === 'library' ? await pickScreenshot() : await takePhoto();
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
            <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => open()}>
              <Text style={styles.link}>Retake</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => onChange(null)}>
              <Text style={styles.link}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.row}>
          {allowLibrary && (
            <Button
              label="Choose screenshot"
              variant="outline"
              onPress={() => open('library')}
              style={styles.flex}
            />
          )}
          <Button label="Take photo" variant="outline" onPress={() => open()} style={styles.flex} />
        </View>
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
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
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
  linkButton: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
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
