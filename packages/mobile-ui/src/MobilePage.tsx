import React from "react";
import { View, StyleSheet } from "react-native";

interface MobilePageProps {
  children: React.ReactNode;
}

const MobilePage: React.FC<MobilePageProps> = ({ children }) => {
  return <View style={styles.container}>{children}</View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default MobilePage;
