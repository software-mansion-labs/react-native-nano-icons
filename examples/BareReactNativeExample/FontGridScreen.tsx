import { View, Text, Pressable, StyleSheet } from 'react-native';
import React from 'react';
import { Icon, MaterialIcon, SWMIconsOutline } from './Icon';
import materialGlyphMap from './assets/nanoicons/MaterialIconsTwotone.glyphmap.json';
import swmGlyphMap from './assets/nanoicons/SWMIconsOutline.glyphmap.json';
import testGlyphMap from './assets/nanoicons/Testicons.glyphmap.json';

const MATERIAL = Object.keys(materialGlyphMap.i).slice(200, 340);
const SWM = Object.keys(swmGlyphMap.i).slice(0, 60);
const TEST = Object.keys(testGlyphMap.i);

export function FontGridScreen({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.container} testID="font-grid-screen">
      <View style={styles.grid}>
        {MATERIAL.map(n => (
          <MaterialIcon key={n} name={n as never} size={22} color="#222222" />
        ))}
      </View>
      <View style={styles.grid}>
        {SWM.slice(0, 30).map(n => (
          <SWMIconsOutline
            key={n}
            name={n as never}
            size={16}
            color="#001A72"
          />
        ))}
      </View>
      <View style={styles.grid}>
        {SWM.slice(30, 60).map(n => (
          <SWMIconsOutline
            key={n}
            name={n as never}
            size={28}
            color="#001A72"
          />
        ))}
      </View>
      <View style={styles.grid}>
        {TEST.map(n => (
          <Icon key={n} name={n as never} size={40} />
        ))}
      </View>
      <View style={styles.grid}>
        <Icon name={'person-walking' as never} size={120} />
        <Icon name={'react-logo' as never} size={120} />
        <SWMIconsOutline name={'ZoomIn' as never} size={120} color="#007AFF" />
      </View>
      <Pressable
        onPress={onClose}
        style={styles.close}
        testID="font-grid-close"
      >
        <Text style={styles.closeText}>Close font grid</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  close: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  closeText: {
    color: '#007AFF',
    fontSize: 16,
  },
});
