import { FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, View } from '@/components/Themed';
import swmIconGlyphMap from '@/assets/nanoicons/SWMIconsOutline.glyphmap.json';
import { SWMIconsOutline } from '@/components/Icon';

const iconSubset = Object.keys(
  swmIconGlyphMap.i
) as (keyof typeof swmIconGlyphMap.i)[];

const Row = ({ icon }: { icon: keyof typeof swmIconGlyphMap.i }) => {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 10,
        alignItems: 'center',
      }}>
      <SWMIconsOutline name={icon} size={42} />
      <Text style={{ fontSize: 24 }}>{icon}</Text>
    </View>
  );
};

export default function TabTwoScreen() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <FlatList
        data={iconSubset}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <Row icon={item} />}
        contentContainerStyle={{
          paddingHorizontal: 10,
          backgroundColor: 'white',
        }}
      />
    </SafeAreaView>
  );
}
