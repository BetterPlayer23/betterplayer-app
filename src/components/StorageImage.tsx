import { getDownloadURL, ref } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';
import { storage } from '@/firebase';

// A screenshot from Firebase Storage. Tap to enlarge.
export function StorageImage({ path, label }: { path: string; label?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setError(false);
    getDownloadURL(ref(storage, path))
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [path]);

  if (error) return <Text style={styles.error}>The screenshot can’t be shown right now.</Text>;
  if (!url) return <ActivityIndicator color={colors.accent} style={styles.loading} />;

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`${label ?? 'Screenshot'}, tap to enlarge`}
        onPress={() => setOpen(true)}>
        <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
        <Text style={styles.hint}>Tap to enlarge</Text>
      </Pressable>
      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <View style={[styles.backdrop, { paddingTop: insets.top + 12 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => setOpen(false)}
            style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
          <Image source={{ uri: url }} style={styles.full} resizeMode="contain" />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  loading: {
    marginVertical: 16,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 11, 22, 0.97)',
    padding: 12,
  },
  close: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
  },
  closeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.accent,
  },
  full: {
    flex: 1,
    width: '100%',
  },
});
