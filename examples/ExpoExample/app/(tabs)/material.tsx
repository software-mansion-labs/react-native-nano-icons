import { FlatList } from 'react-native';

import { Text, View, useThemeColor } from '@/components/Themed';
import materialIconGlyphMap from '@/assets/nanoicons/MaterialIconsTwotone.glyphmap.json';
import { MaterialIcon } from '@/components/Icon';

const iconSubset = Object.keys(
  materialIconGlyphMap.i
) as (keyof typeof materialIconGlyphMap.i)[];

const Row = ({ icon }: { icon: keyof typeof materialIconGlyphMap.i }) => {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 10,
        alignItems: 'center',
      }}>
      <MaterialIcon name={icon} size={42} />
      <Text style={{ fontSize: 24 }}>{icon}</Text>
    </View>
  );
};

export default function MaterialScreen() {
  const background = useThemeColor({}, 'background');

  return (
    <FlatList
      style={{ backgroundColor: background }}
      data={iconSubset}
      keyExtractor={(item) => item}
      renderItem={({ item }) => <Row icon={item} />}
      contentContainerStyle={{
        paddingHorizontal: 10,
      }}
    />
  );
}
