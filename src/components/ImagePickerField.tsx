import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { colors, fonts } from '@/constants/theme';
import { pickImage, type PickedImage } from '@/matches/upload';

// "Take photo" / "Choose from library", with a preview and Remove.
export function ImagePickerField({
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
  const [pickError, setPickError] = useState<string | null>(null);

  async function pick(source: 'camera' | 'library') {
    setPickError(null);
    try {
      const image = await pickImage(source);
      if (image) onChange(image);
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Couldn’t open your photos.');
    }
  }

  const shownError = pickError ?? error;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: value.uri }} style={styles.preview} resizeMode="cover" />
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange(null)}
            style={styles.remove}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          <Button
            label={Platform.OS === 'web' ? 'Take photo' : 'Camera'}
            variant="outline"
            onPress={() => pick('camera')}
            style={styles.flex}
          />
          <Button
            label="Photo library"
            variant="outline"
            onPress={() => pick('library')}
            style={styles.flex}
          />
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
  remove: {
    alignSelf: 'flex-start',
  },
  removeText: {
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
