import { FlatList, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import materialIconGlyphMap from "@/assets/test_icons/material_icons/nanoicons/MaterialIconsTwotone.glyphmap.json";
import { MaterialIcon } from "@/components/Icon";

const iconSubset = Object.keys(
  materialIconGlyphMap.icons,
) as (keyof typeof materialIconGlyphMap.icons)[];

const Row = ({ icon }: { icon: keyof typeof materialIconGlyphMap.icons }) => {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        paddingVertical: 10,
        alignItems: "center",
      }}
    >
      <MaterialIcon name={icon} size={42} colorPalette={["rgba(0, 0, 0, 0.54)"]}/>
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
