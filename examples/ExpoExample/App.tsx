import { StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";

export default function App() {
  return (
    <View style={styles.container}>
      <View
        style={{
          flexDirection: "row",
          columnGap: 20,
          justifyContent: "space-around",
          width: "100%",
        }}
      >
        <View style={{ justifyContent: "center", alignItems: "center" }}>
          <Text style={{ marginBottom: 20 }}>Nanoicons source</Text>
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
            inline <Icon name="triangle" size={20} colorPalette={["blue"]} />{" "}
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
            nanoicon: <Icon name="usFlag" size={12} />
            emoji: 🇺🇸
          </Text>
          <View style={{ borderWidth: 1, borderColor: "red" }}>
            <Icon name="triangleCropped" size={52} colorPalette={["green"]} />
          </View>
        </View>
      </View>
    </View>
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
