import { FlatList } from "react-native";

import { Text, View } from "@/components/Themed";
import swmIconGlyphMap from "@/assets/nanoicons/SWMIconsBroken.glyphmap.json";
import { SWMIconsBroken } from "@/components/Icon";

const iconSubset = Object.keys(
  swmIconGlyphMap.icons,
) as (keyof typeof swmIconGlyphMap.icons)[];

const Row = ({ icon }: { icon: keyof typeof swmIconGlyphMap.icons }) => {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        paddingVertical: 10,
        alignItems: "center",
      }}
    >
      <SWMIconsBroken name={icon} size={42} />
      <Text style={{ fontSize: 24 }}>{icon}</Text>
    </View>
  );
};

export default function TabTwoScreen() {
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
