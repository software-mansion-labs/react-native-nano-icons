import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MulticolorScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Text style={styles.title}>Colored image</Text>
      <Text style={styles.line}>
        This tab icon is an SVG rendered in its original colors.
      </Text>
      <Text style={styles.note}>
        With <Text style={styles.code}>multicolor: true</Text> the pipeline
        emits an <Text style={styles.code}>.imageset</Text> (Render-As:
        Original) instead of a monochrome{' '}
        <Text style={styles.code}>.symbolset</Text>, so the icon keeps its
        colors in the tab bar instead of being template-tinted.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  title: { fontSize: 22, fontWeight: '600' },
  line: { fontSize: 15, color: '#666', textAlign: 'center' },
  note: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  code: { fontFamily: 'Menlo', fontSize: 12, color: '#444' },
});
