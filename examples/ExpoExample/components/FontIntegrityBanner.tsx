import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addFontIntegrityListener,
  getFontIntegrityIssues,
  type FontIntegrityIssue,
} from 'react-native-nano-icons';

export default function FontIntegrityBanner() {
  const [issues, setIssues] = useState<FontIntegrityIssue[]>(
    getFontIntegrityIssues
  );

  useEffect(
    () => addFontIntegrityListener(() => setIssues(getFontIntegrityIssues())),
    []
  );

  const insets = useSafeAreaInsets();

  if (issues.length === 0) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 8 }]}>
      {issues.map((issue) => (
        <Text key={issue.family} style={styles.text}>
          [{issue.linking}] {issue.family}: {issue.message}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#b00020',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  text: {
    color: '#fff',
    fontSize: 12,
  },
});
