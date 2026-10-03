import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, View } from '@/components/Themed';
import { Icon } from '@/components/Icon';

export default function SwmTabScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Icon name="SWM_logo" size={80} />
        <Text style={styles.caption}>
          The tab bar icon for this screen is the same SWM logo forged into a
          custom SF Symbol (nano.swm) — 20 source paths, clip-path, evenodd
          frame, and same-color merging, rendered as a native template glyph.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 30,
  },
  caption: {
    textAlign: 'center',
  },
});
