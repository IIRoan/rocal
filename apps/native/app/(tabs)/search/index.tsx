import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../../src/components/ScreenHeader";

export default function SearchScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="Search" />
      <View style={styles.content}>
        <Text style={styles.title}>Search</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
});
