import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, View } from '@/components/Themed';
import { Icon } from '@/components/Icon';

export default function ColorsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Colored (avatar) tab icons</Text>
        <Text style={styles.subtitle}>
          This tab&apos;s own icon (in the bar below) is generated from a
          colored SVG by a symbolSet with{' '}
          <Text style={styles.code}>multicolor: true</Text>. Instead of a
          monochrome SF Symbol, the CLI emits a colored{' '}
          <Text style={styles.code}>.imageset</Text> (Render-As: Original), so
          iOS shows it in its ORIGINAL colors — while the other tabs stay
          template-tinted.
        </Text>

        <Text style={styles.subtitle}>
          Same icon, rendered losslessly in-content via the font pipeline&apos;s{' '}
          <Text style={styles.code}>&lt;Icon&gt;</Text>:
        </Text>
        <View style={styles.fontRow}>
          <Icon name="person-walking" size={120} />
          <Text style={styles.caption}>{'<Icon> font rendering'}</Text>
        </View>

        <Text style={styles.note}>
          ↓ Look at the &quot;Colors&quot; tab icon in the bar — it&apos;s in
          full color.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
    gap: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.8,
  },
  code: {
    fontFamily: 'Courier',
    fontWeight: '600',
  },
  fontRow: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  caption: {
    fontSize: 12,
    opacity: 0.7,
  },
  note: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
    opacity: 0.9,
  },
});
