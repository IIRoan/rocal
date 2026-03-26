import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const MobileSidebar = () => {
  return (
    <View style={styles.container}>
      <Text>Mobile Sidebar</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
});

export default MobileSidebar;
