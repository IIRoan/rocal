import React from 'react';
import { View, SafeAreaView, StyleSheet } from 'react-native';

interface MobilePageProps {
  children: React.ReactNode;
}

const MobilePage: React.FC<MobilePageProps> = ({ children }) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
});

export default MobilePage;
