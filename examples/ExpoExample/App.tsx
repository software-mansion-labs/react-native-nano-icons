import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import NanoiconsShowcase from "NanoiconsShowcase";
import FontsComparision from "FontsComparision";

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top"]} style={[styles.container]}>
        <ScrollView
          // style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <FontsComparision />
          <NanoiconsShowcase />
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
    backgroundColor: "#ebf0fb",
    justifyContent: "center",
    alignItems: "center",
  },
});
