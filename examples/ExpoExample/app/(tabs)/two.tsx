import { FlatList, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import swmIconGlyphMap from "@/assets/test_icons/swm_icons/nanoicons/SWMIconsBroken.glyphmap.json";
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
      renderItem={({ item }) => <Row icon={item} />}
      keyExtractor={(item) => item}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: "80%",
  },
});
