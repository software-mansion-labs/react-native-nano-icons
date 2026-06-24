import { Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SystemScreen() {
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Text style={styles.title}>SF Symbol rendering modes</Text>
      <Text style={styles.line}>
        SF Symbols are iOS-only. On Android, custom nano-icons render in the
        native tab bar as VectorDrawables (see the other tabs).
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
});
