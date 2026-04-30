import { View, Text, StyleSheet } from "react-native";

export default function CategoryManageScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Manage Categories</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
});
