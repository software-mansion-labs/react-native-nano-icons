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
        emits a <Text style={styles.code}>VectorDrawable</Text>. The tab uses it
        as a <Text style={styles.code}>drawableResource</Text> with{' '}
        <Text style={styles.code}>tintingMode: 'original'</Text>, so the bar
        shows the drawable's own colors instead of template-tinting it with the
        item icon color.
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
