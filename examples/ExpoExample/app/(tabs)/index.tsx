import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function TabOneScreen() {
  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top"]} style={[styles.container]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <View
            style={{
              flexDirection: "row",
              columnGap: 20,
              justifyContent: "space-around",
              width: "100%",
            }}
          >
            <View
              style={{
                justifyContent: "center",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ marginBottom: 20 }}>Nanoicons examples</Text>
              <View style={{ borderWidth: 1, borderColor: "red" }}>
                <Icon name="AO" size={52} />
              </View>

              <Text>
                inline <Icon name="AO" />
                icon test
              </Text>

              <View style={{ borderWidth: 1, borderColor: "red" }}>
                <Icon name="message" size={52} colorPalette={["#7e0c0c"]} />
              </View>

              <Text>
                inline
                <Icon name="triangle" size={20} colorPalette={["blue"]} />
                icon test
              </Text>

              <View style={{ borderWidth: 1, borderColor: "red" }}>
                <Icon name="triangle" size={52} colorPalette={["blue"]} />
              </View>
              <View style={{ borderWidth: 1, borderColor: "red" }}>
                <Icon name="usFlag" size={52} />
              </View>

              <View style={{ borderWidth: 1, borderColor: "red" }}>
                <Icon name="star" size={52} />
              </View>
              <Text>
                nanoicon: <Icon name="usFlag" size={12} /> emoji: 🇺🇸
              </Text>
              <View style={{ borderWidth: 1, borderColor: "red" }}>
                <Icon
                  name="triangleCropped"
                  size={52}
                  colorPalette={["green"]}
                />
              </View>
              <View style={{ borderWidth: 1, borderColor: "red" }}>
                <Icon
                  name="complicated-icon-1"
                  size={52}
                  colorPalette={["blue"]}
                />
              </View>
              <Text style={{ fontSize: 24 }}>
                complicated inline
                <Icon
                  name="complicated-icon-2"
                  size={24}
                  colorPalette={["#2c14e0"]}
                />
                icon
              </Text>
              <View style={{ flexDirection: "row" }}>
                <View style={{ alignItems: "center" }}>
                  <Icon name="person-walking" size={150} />
                  <Text style={{ textAlign: "center", maxWidth: "40%" }}>
                    ⬆️ "person-walking" original
                  </Text>
                </View>
                <View style={{ alignItems: "center" }}>
                  <Icon
                    name="person-walking"
                    size={150}
                    colorPalette={[
                      "#FCC9A7",
                      "#1F252A",
                      "#FCC9A7",
                      "#1F252A",
                      "#092330",
                      "#0C2C40",
                      "#FCC9A7",
                      "#FCC9A7",
                      "#1C2226",
                      "#123036",
                      "#123036",
                      "#FCF3F0",
                      "#FCC9A7",
                      "#F4BE9A",
                      "#FCC9A7",
                      "#FCC9A7",
                      "#1C2226",
                      "#FCC9A7",
                      "red",
                      "#0C2C40",
                      "#FCF3F0",
                      "#EADDD8",
                      "#AFAFAF",
                      "#D1D1D1",
                      "#FCC9A7",
                      "#FCC9A7",
                      "#123036",
                      "#EADDD8",
                      "#EADDD8",
                      "#1C2226",
                    ]}
                  />
                  <Text style={{ textAlign: "center", maxWidth: "60%" }}>
                    ⬆️ "person-walking" shirt color override via colorPalette
                    prop
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 30,
    margin: 20,
  },
  groupHeader: {
    fontSize: 20,
    marginBottom: 20,
  },
  group: {
    margin: 20,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 20,
  },
  container: {
    flex: 1,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
  },
});
