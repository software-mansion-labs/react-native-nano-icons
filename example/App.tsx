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
          <Icon name="AO" size={52} color={"blue"} />
          <Icon name="message" size={52} color={"#7e0c0c"} />
          <Icon name="triangle" size={52} color={"blue"} />
          <Icon name="usFlag" size={52} color={"blue"} />
          <Icon name="star" size={52} />
          <Icon name="triangleCropped" color="green" size={52} />
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
