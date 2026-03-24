import { FlatList } from "react-native";

import { Text, View } from "@/components/Themed";
import materialIconGlyphMap from "@/assets/nanoicons/MaterialIconsTwotone.glyphmap.json";
import { MaterialIcon } from "@/components/Icon";

const iconSubset = Object.keys(
  materialIconGlyphMap.i,
) as (keyof typeof materialIconGlyphMap.i)[];

const Row = ({ icon }: { icon: keyof typeof materialIconGlyphMap.i }) => {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        paddingVertical: 10,
        alignItems: "center",
      }}
    >
      <MaterialIcon name={icon} size={42} />
      <Text style={{ fontSize: 24 }}>{icon}</Text>
    </View>
  );
};

export default function MaterialScreen() {
  return (
    <FlatList
      data={iconSubset}
      keyExtractor={(item) => item}
      renderItem={({ item }) => <Row icon={item} />}
      contentContainerStyle={{
        paddingHorizontal: 10,
        backgroundColor: "white",
      }}
    />
  );
}
