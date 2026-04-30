import { View, Text, StyleSheet } from "react-native";
import { Link } from "expo-router";

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Screen not found</Text>
      <Link href="/" style={styles.link}>
        Go to home
      </Link>
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
    marginBottom: 16,
  },
  link: {
    fontSize: 16,
    color: "#007AFF",
  },
});
